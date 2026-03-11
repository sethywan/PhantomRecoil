import unittest

import updater


class TestUpdaterVersionParsing(unittest.TestCase):
    def test_parse_version_accepts_prefixed(self):
        self.assertEqual(updater._parse_version('v1.2.3'), (1, 2, 3))

    def test_parse_version_accepts_unprefixed(self):
        self.assertEqual(updater._parse_version('1.2.3'), (1, 2, 3))

    def test_parse_version_rejects_invalid(self):
        self.assertIsNone(updater._parse_version('v1.2'))
        self.assertIsNone(updater._parse_version('latest'))

    def test_newer_version_compare(self):
        self.assertTrue(updater._is_newer_version('v1.0.0', 'v1.0.1'))
        self.assertFalse(updater._is_newer_version('v1.1.0', 'v1.0.9'))
        self.assertFalse(updater._is_newer_version('v1.1.0', 'invalid'))


class TestUpdaterHelpers(unittest.TestCase):
    def test_parse_sha256sums_accepts_filename_then_hash(self):
        text = (
            "Phantom_Recoil_Standalone.exe "
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n"
        )
        parsed = updater._parse_sha256sums(text)
        self.assertIn('Phantom_Recoil_Standalone.exe', parsed)
        self.assertEqual(
            parsed['Phantom_Recoil_Standalone.exe'],
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        )

    def test_parse_sha256sums_accepts_hash_then_filename(self):
        text = (
            "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210 "
            "PhantomRecoilSetup_v1.0.19.exe\n"
        )
        parsed = updater._parse_sha256sums(text)
        self.assertIn('PhantomRecoilSetup_v1.0.19.exe', parsed)
        self.assertEqual(
            parsed['PhantomRecoilSetup_v1.0.19.exe'],
            'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        )

    def test_select_asset_by_names_case_insensitive(self):
        release_data = {
            'assets': [
                {'name': 'Phantom_Recoil_Standalone.exe', 'browser_download_url': 'https://example.invalid/a'},
            ]
        }
        asset = updater._select_asset_by_names(release_data, ['phantom_recoil_standalone.exe'])
        self.assertIsNotNone(asset)
        self.assertEqual(asset['name'], 'Phantom_Recoil_Standalone.exe')

    def test_select_installer_asset_prefers_tagged_name(self):
        release_data = {
            'tag_name': 'v1.0.19',
            'assets': [
                {'name': 'PhantomRecoilSetup_v1.0.18.exe', 'browser_download_url': 'https://example.invalid/old'},
                {'name': 'PhantomRecoilSetup_v1.0.19.exe', 'browser_download_url': 'https://example.invalid/new'},
            ],
        }
        asset = updater._select_installer_asset(release_data)
        self.assertIsNotNone(asset)
        self.assertEqual(asset['name'], 'PhantomRecoilSetup_v1.0.19.exe')


if __name__ == '__main__':
    unittest.main()
