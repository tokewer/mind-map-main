# -*- coding: utf-8 -*-
# 思绪思维导图 - 本地服务器（静态托管 + 本地文件夹存储 API）
# 数据以本地文件夹为主：data/store/ 存键值（导图文件、复习记录、历史、设置等），
# data/images/ 存节点图片。浏览器 localStorage 仅作快速缓存，可被清空而不丢数据。
# 用 launcher.ps1 调用：python server.py
import http.server
import socketserver
import gzip
import os
import json
import re
import base64
import binascii
import tempfile
import threading
from urllib.parse import unquote, urlparse


def _resolve_port(default=8080):
    """默认仍是 8080（原有的「启动思绪思维导图.bat」行为完全不变）。
    额外允许用命令行数字参数 / --port=xxxx / 环境变量 MINDMAP_PORT 指定端口，
    这样「学习工具中心」可以在不改变原有点击启动方式的前提下，把它放到 8081。"""
    import sys
    for arg in sys.argv[1:]:
        if arg.isdigit():
            return int(arg)
        if arg.startswith('--port='):
            value = arg.split('=', 1)[1]
            if value.isdigit():
                return int(value)
    env = os.environ.get('MINDMAP_PORT')
    if env and env.isdigit():
        return int(env)
    return default


PORT = _resolve_port()
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, 'data')
STORE_DIR = os.path.join(DATA_DIR, 'store')
IMAGES_DIR = os.path.join(DATA_DIR, 'images')
GZIP_EXT = ('.js', '.css', '.html', '.json', '.svg')

# 扩展名 -> Content-Type
IMG_MIME = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    'avif': 'image/avif',
}

# 键名只允许这些字符，杜绝路径穿越
SAFE_KEY_RE = re.compile(r'^[A-Za-z0-9_.\-]+$')
SAFE_NAME_RE = re.compile(r'^[A-Za-z0-9_.\-]+$')
IMG_PREFIX_RE = re.compile(r'^data:image/([A-Za-z0-9.+-]+);base64,')
MAX_BODY_BYTES = 25 * 1024 * 1024

_cache = {}
_cache_lock = threading.Lock()
_file_write_lock = threading.Lock()
_storage_lock = threading.Lock()
_MAX_CACHE = 40


def ensure_dirs():
    for d in (DATA_DIR, STORE_DIR, IMAGES_DIR):
        os.makedirs(d, exist_ok=True)


def _atomic_write(path, data_bytes):
    """先写目标目录内的唯一临时文件再原子替换，避免半写数据和并发冲突"""
    directory = os.path.dirname(path) or '.'
    fd, tmp = tempfile.mkstemp(prefix='.tmp-', dir=directory)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data_bytes)
            f.flush()
            os.fsync(f.fileno())
        with _file_write_lock:
            os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


class RequestBodyTooLarge(Exception):
    pass


class GzipHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, format, *args):
        pass

    # ---------- 响应工具 ----------
    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, body, content_type, status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        if content_type == 'image/svg+xml':
            self.send_header(
                'Content-Security-Policy',
                "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
            )
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _validate_api_post(self):
        content_type = self.headers.get('Content-Type', '').split(';', 1)[0].strip().lower()
        if content_type != 'application/json':
            self.close_connection = True
            self._send_json({'ok': False, 'message': 'Content-Type 必须是 application/json'}, 415)
            return False

        origin = self.headers.get('Origin')
        if origin:
            parsed = urlparse(origin)
            origin_host = (parsed.hostname or '').lower()
            origin_authority = parsed.netloc.lower()
            request_authority = self.headers.get('Host', '').lower()
            if (
                parsed.scheme not in ('http', 'https')
                or origin_host not in ('127.0.0.1', 'localhost')
                or origin_authority != request_authority
            ):
                self.close_connection = True
                self._send_json({'ok': False, 'message': '不允许跨站写入本地数据'}, 403)
                return False
        return True

    def _read_body(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except (TypeError, ValueError):
            raise ValueError('Content-Length 不合法')
        if length < 0:
            raise ValueError('Content-Length 不合法')
        if length > MAX_BODY_BYTES:
            raise RequestBodyTooLarge()
        if length == 0:
            return b''
        body = self.rfile.read(length)
        if len(body) != length:
            raise ValueError('请求体不完整')
        return body

    # ---------- API：图片 ----------
    def _image_path(self, name):
        if not isinstance(name, str) or not SAFE_NAME_RE.fullmatch(name):
            return None
        path = os.path.abspath(os.path.join(IMAGES_DIR, name))
        try:
            if os.path.commonpath((path, os.path.abspath(IMAGES_DIR))) != os.path.abspath(IMAGES_DIR):
                return None
        except ValueError:
            return None
        return path

    def serve_image_get(self, name):
        name = unquote(name)
        path = self._image_path(name)
        if not path or not os.path.isfile(path):
            self.send_error(404)
            return
        ext = os.path.splitext(name)[1].lstrip('.').lower()
        mime = IMG_MIME.get(ext, 'application/octet-stream')
        with open(path, 'rb') as f:
            self._send_bytes(f.read(), mime)

    def serve_image_post(self):
        try:
            raw = self._read_body()
            data = json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json({'ok': False, 'message': '请求体不是有效 JSON'}, 400)
            return
        if not isinstance(data, dict):
            self._send_json({'ok': False, 'message': '请求体必须是 JSON 对象'}, 400)
            return

        name = data.get('name', '')
        if not isinstance(name, str) or not SAFE_NAME_RE.fullmatch(name):
            self._send_json({'ok': False, 'message': '图片名不合法'}, 400)
            return
        extension = os.path.splitext(name)[1].lstrip('.').lower()
        if extension not in IMG_MIME:
            self._send_json({'ok': False, 'message': '图片扩展名不支持'}, 400)
            return

        content = data.get('data', '')
        if not isinstance(content, str):
            self._send_json({'ok': False, 'message': '图片数据不是 base64 图片'}, 400)
            return
        prefix = IMG_PREFIX_RE.match(content)
        if not prefix:
            self._send_json({'ok': False, 'message': '图片数据不是 base64 图片'}, 400)
            return
        mime_subtype = prefix.group(1).lower()
        mime_extension = {
            'jpeg': 'jpg',
            'jpg': 'jpg',
            'svg+xml': 'svg',
            'x-icon': 'ico',
        }.get(mime_subtype, mime_subtype)
        normalized_extension = 'jpg' if extension in ('jpg', 'jpeg') else extension
        if mime_extension != normalized_extension:
            self._send_json({'ok': False, 'message': '图片 MIME 与扩展名不匹配'}, 400)
            return

        try:
            img_bytes = base64.b64decode(content[prefix.end():], validate=True)
        except (ValueError, binascii.Error):
            self._send_json({'ok': False, 'message': 'base64 解码失败'}, 400)
            return
        if not img_bytes:
            self._send_json({'ok': False, 'message': '图片数据不能为空'}, 400)
            return

        path = self._image_path(name)
        if not path:
            self._send_json({'ok': False, 'message': '图片名不合法'}, 400)
            return
        _atomic_write(path, img_bytes)
        self._send_json({'ok': True, 'url': '/api/image/' + name})

    # ---------- API：键值存储 ----------
    def serve_storage_get(self):
        keys = {}
        if os.path.isdir(STORE_DIR):
            for fn in sorted(os.listdir(STORE_DIR)):
                if not fn.endswith('.json'):
                    continue
                key = fn[:-5]
                if not SAFE_KEY_RE.match(key):
                    continue
                fp = os.path.join(STORE_DIR, fn)
                try:
                    with open(fp, 'r', encoding='utf-8') as f:
                        keys[key] = f.read()
                except Exception:
                    continue
        self._send_json({'keys': keys})

    def serve_storage_post(self):
        try:
            raw = self._read_body()
            body = json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json({'ok': False, 'message': '请求体不是有效 JSON'}, 400)
            return
        if not isinstance(body, dict):
            self._send_json({'ok': False, 'message': '请求体必须是 JSON 对象'}, 400)
            return

        keys = body.get('keys', {})
        remove = body.get('remove', [])
        if not isinstance(keys, dict) or not isinstance(remove, list):
            self._send_json({'ok': False, 'message': 'keys 必须是对象且 remove 必须是数组'}, 400)
            return
        if any(not isinstance(key, str) or not SAFE_KEY_RE.fullmatch(key) for key in keys):
            self._send_json({'ok': False, 'message': '存储键不合法'}, 400)
            return
        if any(not isinstance(key, str) or not SAFE_KEY_RE.fullmatch(key) for key in remove):
            self._send_json({'ok': False, 'message': '删除键不合法'}, 400)
            return

        encoded = {}
        try:
            for key, value in keys.items():
                if not isinstance(value, str):
                    value = json.dumps(value, ensure_ascii=False)
                encoded[key] = value.encode('utf-8')
        except (TypeError, ValueError):
            self._send_json({'ok': False, 'message': '存储值无法序列化'}, 400)
            return

        remove_keys = [key for key in remove if key not in encoded]
        written = 0
        removed = 0
        failed = []
        with _storage_lock:
            for key, value in encoded.items():
                fp = os.path.join(STORE_DIR, key + '.json')
                try:
                    _atomic_write(fp, value)
                    written += 1
                except OSError:
                    failed.append(key)
            for key in remove_keys:
                fp = os.path.join(STORE_DIR, key + '.json')
                if not os.path.isfile(fp):
                    continue
                try:
                    os.remove(fp)
                    removed += 1
                except OSError:
                    failed.append(key)
        if failed:
            self._send_json({
                'ok': False,
                'message': '部分存储操作失败',
                'written': written,
                'removed': removed,
                'failed': failed,
            }, 500)
            return
        self._send_json({'ok': True, 'written': written, 'removed': removed})

    # ---------- 路由 ----------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path.startswith('/api/image/'):
                return self.serve_image_get(path[len('/api/image/'):])
            if path == '/api/storage':
                return self.serve_storage_get()
        except Exception:
            self.send_error(500)
            return
        self._serve_static()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path in ('/api/storage', '/api/image', '/api/image/'):
                if not self._validate_api_post():
                    return
            if path == '/api/storage':
                return self.serve_storage_post()
            if path in ('/api/image', '/api/image/'):
                return self.serve_image_post()
        except RequestBodyTooLarge:
            self._send_json({'ok': False, 'message': '请求体过大'}, 413)
            return
        except ValueError as error:
            self._send_json({'ok': False, 'message': str(error)}, 400)
            return
        except Exception:
            self._send_json({'ok': False, 'message': '服务器错误'}, 500)
            return
        self.send_error(404)

    # ---------- 静态托管（带 gzip） ----------
    def _serve_static(self):
        try:
            path = self.translate_path(self.path)
            if not os.path.isfile(path):
                return super().do_GET()
            ext = os.path.splitext(path)[1].lower()
            accept_encoding = self.headers.get('Accept-Encoding', '')
            if ext not in GZIP_EXT or 'gzip' not in accept_encoding:
                return super().do_GET()
            st = os.stat(path)
            key = (path, st.st_mtime, st.st_size)
            with _cache_lock:
                body = _cache.get(key)
                if body is None:
                    with open(path, 'rb') as f:
                        raw = f.read()
                    body = gzip.compress(raw, 6)
                    _cache[key] = body
                    if len(_cache) > _MAX_CACHE:
                        _cache.pop(next(iter(_cache)))
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            try:
                return super().do_GET()
            except Exception:
                pass


class ThreadingHTTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    ensure_dirs()
    print('思绪思维导图已启动: http://127.0.0.1:{}'.format(PORT))
    print('数据存储目录: {}'.format(DATA_DIR))
    with ThreadingHTTPServer(('127.0.0.1', PORT), GzipHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass