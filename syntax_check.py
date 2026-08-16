import ast
import pathlib
import sys

failed = False
for p in pathlib.Path('.').rglob('*.py'):
    try:
        ast.parse(p.read_text(encoding='utf-8'))
    except SyntaxError as e:
        failed = True
        print('Syntax error in', p, e)
    except Exception as e:
        failed = True
        print('Scan error in', p, e)

sys.exit(1 if failed else 0)
