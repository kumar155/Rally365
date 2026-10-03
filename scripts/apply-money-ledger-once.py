from pathlib import Path

page = Path("app/page.tsx")
if "const expenseLedger = useMemo" in page.read_text():
    print("Money ledger is already implemented")
    raise SystemExit(0)
exec(Path("scripts/patch-money-ledger.py").read_text(), {})
