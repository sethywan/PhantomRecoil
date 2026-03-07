import webview
import threading
import os
from macro import RecoilMacro
import win32api
import win32con
import ctypes
import sys
import updater

class Api:
    def __init__(self):
        self.macro = RecoilMacro()
        self.window = None
        
        # Start the background polling thread.
        self.macro_thread = threading.Thread(target=self.macro.start, daemon=True)
        self.macro_thread.start()

    def set_window(self, window):
        self.window = window

    def set_recoil(self, x, y):
        print(f"[Backend] Profile selected -> X:{x}, Y:{y}")
        self.macro.update_recoil(x, y)

    def set_multiplier(self, mult):
        print(f"[Backend] Intensity set -> {mult}")
        self.macro.set_multiplier(mult)
        
    def get_caps_state(self):
        """Called by Javascript polling interval to safely get state without threading crashes"""
        try:
            return bool(ctypes.windll.user32.GetKeyState(win32con.VK_CAPITAL) & 0x0001)
        except:
            return False

if __name__ == '__main__':
    # 1. Start GitHub Updater in background thread! This prevents the 5-sec API timeout from freezing the app start.
    threading.Thread(target=updater.run_auto_updater, daemon=True).start()

    api = Api()
    
    # 2. PyInstaller _MEIPASS dynamic path resolution for the embedded Web Folder
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(__file__)
        
    html_file = os.path.join(base_path, 'web', 'index.html')
    icon_file = os.path.join(base_path, 'icon.ico')
    
    # Create the pywebview OS Window wrapping our beautiful web folder
    window = webview.create_window(
        'Phantom Recoil', 
        url=html_file, 
        js_api=api,
        width=1100, 
        height=700,
        min_size=(900, 550),
        background_color='#09090b',
        icon=icon_file
    )
    api.set_window(window)
    # private_mode=False ensures localStorage (favorites, DPI) isn't wiped on exit
    webview.start(private_mode=False)
