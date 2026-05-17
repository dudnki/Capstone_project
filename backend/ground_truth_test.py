import sqlite3, textwrap
conn = sqlite3.connect('capstone.db')
cur = conn.cursor()
cur.execute('SELECT question, ground_truth, user_answer, context FROM qa_evaluations ORDER BY created_at DESC LIMIT 3')
for i, row in enumerate(cur.fetchall(), 1):
      print(f'=== Q{i} ===')
      print('질문:', row[0])
      print('ground_truth:', row[1])
      print('user_answer:', row[2][:200] if row[2] else 'None')
      print('context(앞300자):', row[3][:300] if row[3] else 'None')
      print()
      conn.close()
