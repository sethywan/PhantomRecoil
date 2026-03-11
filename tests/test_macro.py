import unittest

from macro import RecoilMacro
import win32con


class TestRecoilMacroValidation(unittest.TestCase):
    def setUp(self):
        self.macro = RecoilMacro()

    def test_update_recoil_sanitizes_non_numeric(self):
        self.macro.update_recoil('abc', None)
        self.assertEqual(self.macro.recoil_x, 0.0)
        self.assertEqual(self.macro.recoil_y, 0.0)

    def test_set_multiplier_clamps_bounds(self):
        self.macro.set_multiplier(-10)
        self.assertEqual(self.macro.multiplier, 0.01)

        self.macro.set_multiplier(42)
        self.assertEqual(self.macro.multiplier, 1.0)

    def test_set_multiplier_fallback_default(self):
        self.macro.set_multiplier('nan-value')
        self.assertEqual(self.macro.multiplier, 0.5)

    def test_set_hotkey_accepts_capslock(self):
        result = self.macro.set_hotkey(win32con.VK_CAPITAL)  # 0x14
        self.assertTrue(result)
        self.assertEqual(self.macro.hotkey_vk, win32con.VK_CAPITAL)

    def test_set_hotkey_accepts_function_keys(self):
        for vk in [0x70, 0x71, 0x7B]:  # F1, F2, F12
            result = self.macro.set_hotkey(vk)
            self.assertTrue(result, f"set_hotkey should accept VK 0x{vk:02X}")
            self.assertEqual(self.macro.hotkey_vk, vk)

    def test_set_hotkey_rejects_letter_key(self):
        self.macro.set_hotkey(win32con.VK_CAPITAL)  # set a known good key first
        result = self.macro.set_hotkey(0x41)         # 'A' — not allowed
        self.assertFalse(result)
        self.assertEqual(self.macro.hotkey_vk, win32con.VK_CAPITAL)  # unchanged

    def test_set_hotkey_rejects_enter(self):
        result = self.macro.set_hotkey(0x0D)  # VK_RETURN
        self.assertFalse(result)

    def test_get_state_snapshot_includes_hotkey(self):
        self.macro.set_hotkey(0x72)  # F3
        snapshot = self.macro.get_state_snapshot()
        self.assertIn('hotkey_vk', snapshot)
        self.assertIn('hotkey_name', snapshot)
        self.assertIn('game_running', snapshot)
        self.assertEqual(snapshot['hotkey_vk'], 0x72)
        self.assertEqual(snapshot['hotkey_name'], 'F3')


if __name__ == '__main__':
    unittest.main()
