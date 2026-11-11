import sys
from PIL import Image

def main():
    if len(sys.argv) < 4:
        print("Usage: verify_gif.py <file> <width> <height> [frames]")
        sys.exit(1)

    file_path = sys.argv[1]
    expected_w = int(sys.argv[2])
    expected_h = int(sys.argv[3])
    expected_frames = int(sys.argv[4]) if len(sys.argv) > 4 else 1

    try:
        im = Image.open(file_path)
    except Exception as e:
        print(f"PIL_OPEN_ERROR: {e}")
        sys.exit(2)

    if im.format != "GIF":
        print(f"FORMAT_ERROR: expected GIF, got {im.format}")
        sys.exit(3)

    if im.size != (expected_w, expected_h):
        print(f"SIZE_ERROR: expected {(expected_w, expected_h)}, got {im.size}")
        sys.exit(4)

    n_frames = getattr(im, "n_frames", 1)
    if n_frames != expected_frames:
        print(f"FRAMES_ERROR: expected {expected_frames}, got {n_frames}")
        sys.exit(5)

    try:
        for i in range(n_frames):
            im.seek(i)
            pixels = list(im.getdata())
            if len(pixels) != expected_w * expected_h:
                print(f"PIXEL_COUNT_ERROR: frame {i} has {len(pixels)} pixels, expected {expected_w * expected_h}")
                sys.exit(6)
    except Exception as e:
        print(f"DECODE_ERROR: frame {i} failed decoding: {e}")
        sys.exit(7)

    print("PIL_VERIFIED_SUCCESS")

if __name__ == "__main__":
    main()
