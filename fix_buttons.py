import os
import re

files_to_update = [
    "src/app/[locale]/page.tsx",
    "src/app/[locale]/[id]/page.tsx",
    "src/app/[locale]/login/page.tsx",
    "src/app/[locale]/signup/page.tsx",
    "src/app/[locale]/forgot-password/page.tsx",
    "src/app/[locale]/reset-password/page.tsx",
    "src/app/[locale]/profile/page.tsx",
]

for file_path in files_to_update:
    full_path = os.path.join('/Users/ress/Documents/0000/02.oripics-MVP/frontend', file_path)
    if not os.path.exists(full_path):
        continue
    
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # We want to replace text-slate-900 with text-white if it's inside a class string that also contains bg-blue-, bg-purple-, from-blue-, from-purple-
    # This might be tricky with simple regex if the classes are far apart.
    # A safer way: find all class="...", className="..." and check if they contain a colored background. If so, replace text-slate-900 with text-white.
    
    def replacer(match):
        class_str = match.group(0)
        # Identify if this element is a primary button / colored box
        colored_bg_keywords = ['bg-blue-600', 'bg-blue-700', 'bg-purple-600', 'bg-gradient-to-r', 'from-blue-700', 'from-purple-600', 'bg-red-600', 'bg-green-600']
        if any(keyword in class_str for keyword in colored_bg_keywords) and 'text-slate-900' in class_str:
            return class_str.replace('text-slate-900', 'text-white')
        return class_str

    content = re.sub(r'className="([^"]+)"', replacer, content)
    content = re.sub(r'className=\{`([^`]+)`\}', replacer, content)
        
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Fixed buttons in {file_path}")

print("Done.")
