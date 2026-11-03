import os
from PIL import Image

def generate_pwa_icons():
    src_path = "public/logo/srt-logo.png"
    if not os.path.exists(src_path):
        print(f"Source image not found: {src_path}")
        return

    os.makedirs("public/icons", exist_ok=True)
    img = Image.open(src_path).convert("RGBA")

    # 1. Standard Icons (purpose: any)
    sizes = [
        (192, 192, "public/icons/icon-192x192.png"),
        (512, 512, "public/icons/icon-512x512.png"),
        (180, 180, "public/icons/apple-touch-icon.png"),
        (180, 180, "public/apple-touch-icon.png"),
    ]

    for w, h, path in sizes:
        resized = img.resize((w, h), Image.Resampling.LANCZOS)
        resized.save(path, format="PNG", optimize=True)
        print(f"Generated {path} ({w}x{h}) - {os.path.getsize(path)} bytes")

    # 2. Maskable Icons (purpose: maskable)
    # Android maskable requires 20% safe padding so circular/squircle masks don't cut off crest
    maskable_sizes = [
        (192, "public/icons/icon-maskable-192x192.png"),
        (512, "public/icons/icon-maskable-512x512.png"),
    ]

    for size, path in maskable_sizes:
        # Create solid background canvas (using school gold / dark or white)
        # White background matches the crest circle
        canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        # Inner logo size (80% of canvas)
        inner_size = int(size * 0.8)
        inner_img = img.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
        offset = ((size - inner_size) // 2, (size - inner_size) // 2)
        canvas.paste(inner_img, offset, inner_img)
        canvas.save(path, format="PNG", optimize=True)
        print(f"Generated Maskable {path} ({size}x{size}) - {os.path.getsize(path)} bytes")

if __name__ == "__main__":
    generate_pwa_icons()

