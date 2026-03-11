import unittest
from unittest import mock

from ui_app import Api


class TestApiValidation(unittest.TestCase):
    def test_to_finite_number(self):
        self.assertEqual(Api._to_finite_number('12.5', default=0), 12.5)
        self.assertEqual(Api._to_finite_number('not-a-number', default=7), 7.0)
        self.assertEqual(Api._to_finite_number(float('inf'), default=3), 3.0)

    def test_hotkey_state_api_method_exists(self):
        api = Api()
        result = api.get_hotkey_state()
        self.assertIsInstance(result, dict)
        self.assertIn('active', result)
        self.assertIn('game_running', result)
        self.assertIsInstance(result['active'], bool)
        self.assertIsInstance(result['game_running'], bool)
        api.shutdown()

    def test_get_hotkey_returns_vk_and_name(self):
        api = Api()
        result = api.get_hotkey()
        self.assertIn('vk_code', result)
        self.assertIn('name', result)
        self.assertIsInstance(result['vk_code'], int)
        self.assertIsInstance(result['name'], str)
        api.shutdown()

    def test_set_hotkey_accepts_valid_vk(self):
        api = Api()
        result = api.set_hotkey(0x71)  # F2
        self.assertTrue(result.get('ok'))
        self.assertEqual(result.get('vk_code'), 0x71)
        self.assertEqual(result.get('name'), 'F2')
        api.shutdown()

    def test_set_hotkey_rejects_invalid_vk(self):
        api = Api()
        result = api.set_hotkey(0x41)  # 'A' — not allowed
        self.assertFalse(result.get('ok'))
        api.shutdown()

    def test_set_hotkey_rejects_non_numeric(self):
        api = Api()
        result = api.set_hotkey('not-a-number')
        self.assertFalse(result.get('ok'))
        api.shutdown()

    def test_app_info_includes_version_and_title(self):
        api = Api()
        info = api.get_app_info()

        self.assertIn('version', info)
        self.assertIn('title', info)
        self.assertIn('session_id', info)
        self.assertTrue(str(info['version']).startswith('v'))
        self.assertIn(str(info['version']), str(info['title']))

        api.shutdown()

    def test_diag_status_contains_runtime_metadata(self):
        api = Api()
        status = api.get_diag_status()

        self.assertIn('uptime_seconds', status)
        self.assertIn('threads', status)
        self.assertIn('session_id', status)

        api.shutdown()

    def test_dump_diagnostics_api(self):
        api = Api()
        with mock.patch('ui_app.faulthandler.dump_traceback'):
            result = api.dump_diagnostics('test-case')

        self.assertTrue(result.get('ok'))
        self.assertEqual(result.get('reason'), 'test-case')
        api.shutdown()

    def test_internal_objects_are_not_public_api_attributes(self):
        api = Api()

        # Public object attributes can be recursively scanned by pywebview bridge.
        self.assertFalse(hasattr(api, 'window'))
        self.assertFalse(hasattr(api, 'macro'))
        self.assertTrue(hasattr(api, '_window'))
        self.assertTrue(hasattr(api, '_macro'))

        api.shutdown()


if __name__ == '__main__':
    unittest.main()
