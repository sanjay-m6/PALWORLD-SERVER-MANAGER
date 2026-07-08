import struct
import zlib

def create_png_data(width, height):
    """Generate raw PNG data for a solid cyan square"""
    raw = b''
    for _ in range(height):
        raw += b'\x00'
        for _ in range(width):
            raw += b'\x00\xd9\xff\xff'  # RGBA cyan
    
    idat = zlib.compress(raw)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    
    def chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', ihdr)
    png += chunk(b'IDAT', idat)
    png += chunk(b'IEND', b'')
    return png

def create_ico(filepath, sizes=[16, 32, 48, 256]):
    """Create a proper ICO file with PNG-compressed entries"""
    entries = []
    for size in sizes:
        png_data = create_png_data(size, size)
        entries.append((size, png_data))
    
    # ICO header: reserved(2) + type(2) + count(2)
    header = struct.pack('<HHH', 0, 1, len(entries))
    
    # Calculate data offset (header + all directory entries)
    data_offset = 6 + len(entries) * 16
    
    directory = b''
    image_data = b''
    
    for size, png_data in entries:
        w = 0 if size == 256 else size
        h = 0 if size == 256 else size
        
        # ICO directory entry
        directory += struct.pack('<BBBBHHII',
            w,          # width (0 = 256)
            h,          # height (0 = 256)
            0,          # color palette
            0,          # reserved
            1,          # color planes
            32,         # bits per pixel
            len(png_data),  # size of image data
            data_offset + len(image_data)  # offset
        )
        image_data += png_data
    
    with open(filepath, 'wb') as f:
        f.write(header + directory + image_data)

base = r'd:\client Project\Plaworld\src-tauri\icons'

# Generate PNGs
for size, name in [(32, '32x32.png'), (128, '128x128.png'), (256, '128x128@2x.png')]:
    with open(f'{base}\\{name}', 'wb') as f:
        f.write(create_png_data(size, size))

# Generate proper ICO
create_ico(f'{base}\\icon.ico', [16, 32, 48, 256])

# ICNS is macOS only - just use a PNG copy
import shutil
shutil.copy(f'{base}\\128x128.png', f'{base}\\icon.icns')

print("Icons generated with proper ICO format")
