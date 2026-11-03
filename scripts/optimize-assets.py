import os
import io
import base64
from PIL import Image

def optimize_all():
    print("--- OPTIMIZING PUBLIC ASSETS ---")

    # 1. Optimize school_3d_moss_campus.jpg
    campus_path = "public/images/school_3d_moss_campus.jpg"
    if os.path.exists(campus_path):
        orig_size = os.path.getsize(campus_path)
        img = Image.open(campus_path)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=84, optimize=True, progressive=True)
        new_data = buf.getvalue()
        with open(campus_path, "wb") as f:
            f.write(new_data)
        new_size = len(new_data)
        print(f"school_3d_moss_campus.jpg: {orig_size:,} bytes -> {new_size:,} bytes (saved {((orig_size-new_size)/orig_size)*100:.1f}%)")

    # 2. Optimize favicon.svg
    logo_path = "public/logo/srt-logo.png"
    if os.path.exists(logo_path):
        img = Image.open(logo_path)

        # Favicon at 160x160 (super sharp for tab icons and high-DPI displays)
        fav_img = img.resize((160, 160), Image.Resampling.LANCZOS)
        fav_buf = io.BytesIO()
        fav_img.save(fav_buf, format="PNG", optimize=True)
        fav_b64 = base64.b64encode(fav_buf.getvalue()).decode("ascii")

        fav_svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <circle cx="80" cy="80" r="78" fill="#ffffff" stroke="#f2b84b" stroke-width="4" />
  <image href="data:image/png;base64,{fav_b64}" x="10" y="10" width="140" height="140" preserveAspectRatio="xMidYMid meet" />
</svg>'''

        fav_svg_path = "public/favicon.svg"
        orig_fav_size = os.path.getsize(fav_svg_path) if os.path.exists(fav_svg_path) else 0
        with open(fav_svg_path, "w", encoding="utf-8") as f:
            f.write(fav_svg_content)
        new_fav_size = os.path.getsize(fav_svg_path)
        print(f"favicon.svg: {orig_fav_size:,} bytes -> {new_fav_size:,} bytes (saved {((orig_fav_size-new_fav_size)/orig_fav_size)*100:.1f}%)")

        # 3. Optimize logo/srt-logo.svg
        # 512x512 gives ultra-sharp crispness for headers, sidebars, and splash screens
        logo_img = img.resize((512, 512), Image.Resampling.LANCZOS)
        logo_buf = io.BytesIO()
        logo_img.save(logo_buf, format="PNG", optimize=True)
        logo_b64 = base64.b64encode(logo_buf.getvalue()).decode("ascii")

        logo_svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <circle cx="256" cy="256" r="250" fill="#ffffff" stroke="#f2b84b" stroke-width="8" />
  <image href="data:image/png;base64,{logo_b64}" x="30" y="30" width="452" height="452" preserveAspectRatio="xMidYMid meet" />
</svg>'''

        logo_svg_path = "public/logo/srt-logo.svg"
        orig_logo_size = os.path.getsize(logo_svg_path) if os.path.exists(logo_svg_path) else 0
        with open(logo_svg_path, "w", encoding="utf-8") as f:
            f.write(logo_svg_content)
        new_logo_size = os.path.getsize(logo_svg_path)
        print(f"srt-logo.svg: {orig_logo_size:,} bytes -> {new_logo_size:,} bytes (saved {((orig_logo_size-new_logo_size)/orig_logo_size)*100:.1f}%)")

if __name__ == "__main__":
    optimize_all()

