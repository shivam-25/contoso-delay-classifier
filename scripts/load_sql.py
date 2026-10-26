"""Area A: create schema, bulk-load the CSV, and run the three analysis queries."""
import csv, os, pathlib, sys, time
import pymssql

ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVER = os.environ["SQL_SERVER_FQDN"]
DB     = os.environ.get("SQL_DB", "contosodelay")
USER   = os.environ.get("SQL_ADMIN", "contosoadmin")
PWD    = os.environ["SQL_PASS"]


def run_batches(cur, sql):
    """Azure SQL has no GO; split the script on it ourselves."""
    for batch in (b.strip() for b in sql.split("\nGO")):
        if batch:
            cur.execute(batch)


def main():
    print(f"connecting to {SERVER}/{DB} ...")
    conn = pymssql.connect(server=SERVER, user=USER, password=PWD,
                           database=DB, timeout=300, login_timeout=60)
    cur = conn.cursor()

    print("applying schema + training view ...")
    run_batches(cur, (ROOT / "sql" / "01_schema.sql").read_text())
    conn.commit()

    rows = list(csv.DictReader(open(ROOT / "data" / "contoso_delay_training.csv")))
    data = [(r["carrier"], int(r["distance_km"]), float(r["weight_kg"]), int(r["items"]),
             int(r["order_hour"]), int(r["is_sale_day"]), int(r["warehouse_backlog"]),
             float(r["weather_index"]), int(r["delayed"])) for r in rows]

    print(f"loading {len(data):,} rows ...")
    t0 = time.time()
    cur.executemany(
        "INSERT INTO dbo.OrderHistory (carrier,distance_km,weight_kg,items,order_hour,"
        "is_sale_day,warehouse_backlog,weather_index,delayed) "
        "VALUES (%s,%d,%s,%d,%d,%d,%d,%s,%d)", data)
    conn.commit()
    print(f"loaded in {time.time()-t0:.1f}s")

    cur.execute("SELECT COUNT(*) FROM dbo.OrderHistory")
    print(f"row count in Azure SQL: {cur.fetchone()[0]:,}")
    cur.execute("SELECT COUNT(*) FROM dbo.vw_DelayTraining")
    print(f"training view rows:     {cur.fetchone()[0]:,}")

    print("\n" + "=" * 62)
    print("THREE ANALYSIS QUERIES (run against Azure SQL)")
    print("=" * 62)
    script = (ROOT / "sql" / "02_analysis_queries.sql").read_text()
    titles = ["Q1 - delay rate by carrier",
              "Q2 - delay rate by sale day",
              "Q3 - delay rate by warehouse backlog"]
    # Statements are separated by ';' at end of each query block.
    queries = [q.strip() for q in script.split(";") if "SELECT" in q.upper()]
    for title, q in zip(titles, queries):
        print(f"\n--- {title} ---")
        cur.execute(q)
        cols = [d[0] for d in cur.description]
        print("  " + "  ".join(f"{c:>18}" for c in cols))
        for row in cur.fetchall():
            print("  " + "  ".join(f"{str(v):>18}" for v in row))

    conn.close()
    print("\ndone.")


if __name__ == "__main__":
    main()
