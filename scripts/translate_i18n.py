import os
import re
import urllib.request
import urllib.parse
import json
import time

SRC_DIR = r"d:\client Project\Plaworld\src"
I18N_FILE = os.path.join(SRC_DIR, "lib", "i18n.ts")

# Supported target languages and their Google Translate codes
LANG_MAP = {
    'es': 'es',
    'de': 'de',
    'zh': 'zh-CN',
    'it': 'it',
    'ta': 'ta',
    'ru': 'ru'
}

def translate_text(text, target_lang):
    if not text.strip():
        return text
    # Keep symbols/emoji intact
    clean_text = text
    prefix = ""
    if text.startswith("✓ "):
        prefix = "✓ "
        clean_text = text[2:]
    elif text.startswith("📦 "):
        prefix = "📦 "
        clean_text = text[2:]
    elif text.startswith("📁 "):
        prefix = "📁 "
        clean_text = text[2:]
    elif text.startswith("🔍 "):
        prefix = "🔍 "
        clean_text = text[2:]
    elif text.startswith("⚙️ "):
        prefix = "⚙️ "
        clean_text = text[3:]

    try:
        url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" + LANG_MAP[target_lang] + "&dt=t&q=" + urllib.parse.quote(clean_text)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=3) as response:
            res = json.loads(response.read().decode('utf-8'))
            translated = "".join([item[0] for item in res[0] if item[0]])
            return prefix + translated
    except Exception as e:
        print(f"Error translating '{text}' to {target_lang}: {e}")
        return text

def parse_translations_block(content, lang):
    pattern = rf'{lang}:\s*\{{([^}}]+)\}}'
    match = re.search(pattern, content)
    if not match:
        return {}
    
    body = match.group(1)
    # Parse key-value pairs
    pairs = re.findall(r'\'([^\']+)\'\s*:\s*\'([^\']*)\'', body)
    return {k: v for k, v in pairs}

def update_translations_block(content, lang, translations_dict):
    pattern = rf'({lang}:\s*\{{)([^}}]+)(\}})'
    match = re.search(pattern, content)
    if not match:
        return content
        
    header = match.group(1)
    body = match.group(2)
    footer = match.group(3)
    
    # We rebuild the body preserving existing key formatting but with updated values
    lines = body.split("\n")
    new_lines = []
    for line in lines:
        pair_match = re.match(r'^(\s*)\'([^\']+)\'\s*:\s*\'([^\']*)\'\s*(,)?\s*$', line)
        if pair_match:
            indent = pair_match.group(1)
            key = pair_match.group(2)
            comma = pair_match.group(4) or ""
            
            if key in translations_dict:
                safe_val = translations_dict[key].replace("'", "\\'")
                new_lines.append(f"{indent}'{key}': '{safe_val}'{comma}")
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
            
    new_body = "\n".join(new_lines)
    return content.replace(match.group(0), f"{header}{new_body}{footer}")

def main():
    if not os.path.exists(I18N_FILE):
        print(f"i18n.ts file not found at {I18N_FILE}")
        return
        
    with open(I18N_FILE, "r", encoding="utf-8") as f:
        content = f.read()
        
    # Get english keys
    en_dict = parse_translations_block(content, "en")
    print(f"Found {len(en_dict)} keys in English dictionary.")
    
    for lang in LANG_MAP.keys():
        print(f"\nProcessing language: {lang}")
        lang_dict = parse_translations_block(content, lang)
        
        updated_count = 0
        for key, english_val in en_dict.items():
            current_val = lang_dict.get(key, "")
            
            is_abbreviation = english_val in ["RCON", "CPU", "RAM", "PORT", "SLOTS", "PALWORLD", "Palworld", "✓ Installed"]
            
            # Skip long strings to prevent rate limits and save performance
            if len(english_val) >= 60:
                # If the translation value is missing, copy the English value
                if not current_val:
                    lang_dict[key] = english_val
                continue
                
            if (current_val == english_val or not current_val) and not is_abbreviation:
                print(f"Translating '{english_val}' to {lang}...")
                translated = translate_text(english_val, lang)
                lang_dict[key] = translated
                updated_count += 1
                
                # Sleep a bit to prevent rate limit
                time.sleep(0.15)
                
                if updated_count % 20 == 0:
                    print(f"  Translated {updated_count} words so far...")
                    
        if updated_count > 0:
            content = update_translations_block(content, lang, lang_dict)
            with open(I18N_FILE, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Completed and saved {updated_count} translations for {lang}.")
        else:
            print(f"No translation updates needed for {lang}.")

if __name__ == "__main__":
    main()
