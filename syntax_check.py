import ast, pathlib, sys
for p in pathlib.Path('.').rglob('*.py'):
    try:
        ast.parse(p.read_text())
    except Exception as e:
        print('Syntax error in', p, e)
