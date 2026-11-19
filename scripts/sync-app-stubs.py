import os

frontend_app = os.path.abspath('frontend/app')
app_dir = os.path.abspath('app')

created = []
for root, dirs, files in os.walk(frontend_app):
    for f in files:
        if f.endswith('page.tsx') or f.endswith('layout.tsx'):
            rel = os.path.relpath(os.path.join(root, f), frontend_app)
            target = os.path.join(app_dir, rel)
            if not os.path.exists(target):
                os.makedirs(os.path.dirname(target), exist_ok=True)
                import_path = '@/frontend/app/' + rel.replace('\\', '/').rsplit('.', 1)[0]
                content = f'export {{ default }} from "{import_path}";\nexport * from "{import_path}";\n'
                with open(target, 'w', encoding='utf-8') as out:
                    out.write(content)
                created.append(rel)

print(f'Successfully created {len(created)} missing stubs:')
for c in created:
    print('  +', c)
