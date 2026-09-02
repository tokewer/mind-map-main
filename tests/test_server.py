# -*- coding: utf-8 -*-
import base64
import json
import os
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from unittest import mock

import server


PNG_DATA_URL = (
    'data:image/png;base64,'
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
)
SVG_DATA_URL = 'data:image/svg+xml;base64,' + base64.b64encode(
    b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
).decode('ascii')


class ServerApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp_dir.name)
        cls.store_dir = cls.root / 'store'
        cls.images_dir = cls.root / 'images'
        cls.store_dir.mkdir()
        cls.images_dir.mkdir()
        cls.data_patch = mock.patch.multiple(
            server,
            ROOT=str(cls.root),
            DATA_DIR=str(cls.root),
            STORE_DIR=str(cls.store_dir),
            IMAGES_DIR=str(cls.images_dir),
        )
        cls.data_patch.start()
        cls.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.GzipHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.httpd.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.data_patch.stop()
        cls.temp_dir.cleanup()

    def request(self, method, path, body=None, headers=None, return_headers=False):
        connection = HTTPConnection('127.0.0.1', self.port, timeout=3)
        request_headers = dict(headers or {})
        encoded = None
        if body is not None:
            encoded = body if isinstance(body, bytes) else json.dumps(body).encode('utf-8')
            request_headers.setdefault('Content-Type', 'application/json')
            request_headers['Content-Length'] = str(len(encoded))
        connection.request(method, path, body=encoded, headers=request_headers)
        response = connection.getresponse()
        response_headers = dict(response.getheaders())
        payload = response.read()
        connection.close()
        try:
            payload = json.loads(payload.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            pass
        if return_headers:
            return response.status, payload, response_headers
        return response.status, payload

    def test_post_image_without_filename_path_and_get_image(self):
        status, result = self.request(
            'POST', '/api/image', {'name': 'verify.png', 'data': PNG_DATA_URL}
        )
        self.assertEqual(status, 200)
        self.assertTrue(result['ok'])
        self.assertEqual(result['url'], '/api/image/verify.png')
        self.assertEqual((self.images_dir / 'verify.png').read_bytes(), base64.b64decode(PNG_DATA_URL.split(',', 1)[1]))

        status, payload = self.request('GET', '/api/image/verify.png')
        self.assertEqual(status, 200)
        self.assertEqual(payload, base64.b64decode(PNG_DATA_URL.split(',', 1)[1]))

    def test_image_rejects_path_traversal_and_mime_mismatch(self):
        status, result = self.request(
            'POST', '/api/image', {'name': '../escape.png', 'data': PNG_DATA_URL}
        )
        self.assertEqual(status, 400)
        self.assertFalse(result['ok'])
        self.assertFalse((self.root / 'escape.png').exists())

        status, result = self.request(
            'POST', '/api/image', {'name': 'wrong.png', 'data': PNG_DATA_URL.replace('image/png', 'image/jpeg')}
        )
        self.assertEqual(status, 400)
        self.assertFalse(result['ok'])

    def test_storage_write_read_and_remove_lifecycle(self):
        status, result = self.request(
            'POST', '/api/storage', {'keys': {'VERIFY_KEY': 'new'}, 'remove': ['VERIFY_KEY']}
        )
        self.assertEqual(status, 200)
        self.assertTrue(result['ok'])
        self.assertEqual((self.store_dir / 'VERIFY_KEY.json').read_text(encoding='utf-8'), 'new')

        status, result = self.request('GET', '/api/storage')
        self.assertEqual(status, 200)
        self.assertEqual(result['keys']['VERIFY_KEY'], 'new')

        status, result = self.request(
            'POST', '/api/storage', {'keys': {}, 'remove': ['VERIFY_KEY']}
        )
        self.assertEqual(status, 200)
        self.assertTrue(result['ok'])
        self.assertFalse((self.store_dir / 'VERIFY_KEY.json').exists())

    def test_storage_rejects_invalid_key_types_without_500(self):
        status, result = self.request(
            'POST', '/api/storage', {'keys': {123: 'bad'}, 'remove': [456]}
        )
        self.assertEqual(status, 400)
        self.assertFalse(result['ok'])

    def test_api_rejects_non_json_and_cross_origin_writes(self):
        body = json.dumps({'keys': {'BLOCKED': 'value'}, 'remove': []}).encode('utf-8')
        status, result = self.request(
            'POST', '/api/storage', body, {'Content-Type': 'text/plain'}
        )
        self.assertEqual(status, 415)
        self.assertFalse(result['ok'])
        self.assertFalse((self.store_dir / 'BLOCKED.json').exists())

        status, result = self.request(
            'POST',
            '/api/storage',
            {'keys': {'BLOCKED': 'value'}, 'remove': []},
            {'Origin': 'https://evil.example'},
        )
        self.assertEqual(status, 403)
        self.assertFalse(result['ok'])
        self.assertFalse((self.store_dir / 'BLOCKED.json').exists())

        status, result = self.request(
            'POST',
            '/api/storage',
            {'keys': {'SAME_ORIGIN': 'value'}, 'remove': []},
            {'Origin': 'http://127.0.0.1:{}'.format(self.port)},
        )
        self.assertEqual(status, 200)
        self.assertTrue(result['ok'])

    def test_svg_response_uses_sandboxed_content_security_policy(self):
        status, result = self.request(
            'POST', '/api/image', {'name': 'sandbox.svg', 'data': SVG_DATA_URL}
        )
        self.assertEqual(status, 200)
        self.assertTrue(result['ok'])

        status, payload, headers = self.request(
            'GET', '/api/image/sandbox.svg', return_headers=True
        )
        self.assertEqual(status, 200)
        self.assertIn(b'<script>', payload)
        self.assertIn('sandbox', headers.get('Content-Security-Policy', ''))
        self.assertIn("default-src 'none'", headers.get('Content-Security-Policy', ''))

    def test_atomic_write_uses_unique_temporary_files(self):
        target = self.store_dir / 'atomic.json'
        errors = []
        temporary_paths = []
        original_mkstemp = server.tempfile.mkstemp

        def record_mkstemp(*args, **kwargs):
            fd, path = original_mkstemp(*args, **kwargs)
            temporary_paths.append(path)
            return fd, path

        def write(value):
            try:
                server._atomic_write(str(target), value.encode('utf-8'))
            except Exception as error:  # pragma: no cover - assertion below reports it
                errors.append(error)

        with mock.patch.object(server.tempfile, 'mkstemp', side_effect=record_mkstemp):
            threads = [threading.Thread(target=write, args=(value,)) for value in ('one', 'two')]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=3)

        self.assertFalse(errors)
        self.assertEqual(len(set(temporary_paths)), 2)
        self.assertIn(target.read_text(encoding='utf-8'), ('one', 'two'))
        self.assertTrue(all(not os.path.exists(path) for path in temporary_paths))


if __name__ == '__main__':
    unittest.main()
