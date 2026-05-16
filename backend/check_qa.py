import sqlite3

conn = sqlite3.connect("capstone.db")
cur = conn.cursor()
cur.execute("SELECT question, ground_truth, context FROM qa_evaluations ORDER BY created_at DESC LIMIT 10")
rows = cur.fetchall()

for i, r in enumerate(rows, 1):
    print(f"=== Q{i} ===")
    print(f"질문: {r[0]}")
    print(f"GT: {r[1]}")
    print(f"컨텍스트(앞400자): {r[2][:400] if r[2] else 'None'}")
    print()

conn.close()
