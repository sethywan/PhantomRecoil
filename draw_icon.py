import sys
import subprocess

try:
    from PIL import Image, ImageDraw
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image, ImageDraw

def create_crosshair_icon():
    # Create image with transparent background
    size = (256, 256)
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw a dark background circle (Zinc 900)
    draw.ellipse((16, 16, 240, 240), fill=(24, 24, 27, 255), outline=(239, 68, 68, 255), width=12)

    # Draw crosshair lines
    draw.line((128, 40, 128, 216), fill=(239, 68, 68, 255), width=16)
    draw.line((40, 128, 216, 128), fill=(239, 68, 68, 255), width=16)

    # Inner eye / dot (White)
    draw.ellipse((108, 108, 148, 148), fill=(250, 250, 250, 255))

    img.save('icon.ico', format='ICO', sizes=[(256, 256), (128, 128), (64, 64), (32, 32), (16, 16)])
    print("icon.ico generated successfully.")

if __name__ == "__main__":
    create_crosshair_icon()
