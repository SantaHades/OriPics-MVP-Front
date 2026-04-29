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
    "src/app/api/auth/send-verification/route.ts"
]

replacements = [
    (r'bg-\[\#0f172a\]', 'bg-slate-50'),
    (r'from-blue-900/20 via-slate-900 to-black', 'from-blue-50 via-white to-purple-50'),
    (r'text-white', 'text-slate-900'),
    (r'text-gray-400', 'text-slate-600'),
    (r'text-gray-300', 'text-slate-700'),
    (r'text-gray-500', 'text-slate-500'),
    (r'text-slate-400', 'text-slate-600'),
    (r'text-slate-500', 'text-slate-500'),
    (r'border-white/10', 'border-slate-200'),
    (r'border-white/5', 'border-slate-100'),
    (r'border-slate-800', 'border-slate-200'),
    (r'bg-slate-900', 'bg-white'),
    (r'bg-slate-800/50', 'bg-slate-100'),
    (r'bg-slate-800', 'bg-slate-100'),
    (r'bg-black/40', 'bg-slate-100'),
    (r'bg-black/30', 'bg-slate-50'),
    (r'bg-white/5', 'bg-white/80'),
    (r'bg-white/10', 'bg-slate-100'),
    (r'hover:bg-white/5', 'hover:bg-slate-100'),
    (r'hover:bg-white/10', 'hover:bg-slate-200'),
    (r'hover:bg-white/20', 'hover:bg-slate-300'),
    (r'text-blue-400', 'text-blue-600'),
    (r'text-blue-300', 'text-blue-700'),
    (r'text-purple-400', 'text-purple-600'),
    (r'text-purple-300', 'text-purple-700'),
    (r'text-green-400', 'text-green-600'),
    (r'text-green-300', 'text-green-700'),
    (r'text-amber-300', 'text-amber-600'),
    (r'text-amber-400', 'text-amber-600'),
    (r'text-red-400', 'text-red-600'),
    (r'text-red-500', 'text-red-600'),
    (r'border-blue-500/30', 'border-blue-200'),
    (r'border-purple-500/30', 'border-purple-200'),
    (r'border-green-500/30', 'border-green-200'),
    (r'border-amber-500/30', 'border-amber-200'),
    (r'border-red-500/30', 'border-red-200'),
    (r'bg-blue-900/30', 'bg-blue-50'),
    (r'bg-purple-900/30', 'bg-purple-50'),
    (r'bg-green-900/30', 'bg-green-50'),
    (r'bg-amber-900/20', 'bg-amber-50'),
    (r'bg-red-500/20', 'bg-red-50'),
    (r'bg-gradient-to-br from-purple-900/20 to-indigo-900/20', 'bg-gradient-to-br from-purple-50 to-indigo-50'),
    (r'from-purple-900/40', 'from-purple-100'),
    (r'to-indigo-900/40', 'to-indigo-100'),
    (r'shadow-blue-900/40', 'shadow-blue-200/50'),
    (r'shadow-purple-900/20', 'shadow-purple-200/50'),
    (r'shadow-red-900/40', 'shadow-red-200/50'),
    (r'border-white/20', 'border-slate-300'),
    (r'from-slate-800 to-slate-900', 'from-white to-slate-50'),
    (r'text-slate-300', 'text-slate-700'),
    (r'bg-black/50', 'bg-slate-900/50'), # Overlays should remain darkish but maybe slightly lighter
]

for file_path in files_to_update:
    full_path = os.path.join('/Users/ress/Documents/0000/02.oripics-MVP/frontend', file_path)
    if not os.path.exists(full_path):
        print(f"Skipping {file_path}, not found.")
        continue
    
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    for old, new in replacements:
        content = re.sub(old, new, content)
        
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Updated {file_path}")

print("Theme migration completed.")
