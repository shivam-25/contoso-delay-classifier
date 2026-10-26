-- Contoso Delay Classifier :: Area A :: the three required analysis queries
-- Each returns a delay RATE (not a raw count) so carriers/segments are comparable.

-- Q1. Delay rate by carrier -------------------------------------------------
-- "Which carrier actually runs late?" Raw counts would just rank carriers by
-- how much volume they get, so we divide by their own order count.
SELECT
    carrier,
    COUNT(*)                                                   AS orders,
    SUM(CAST(delayed AS INT))                                  AS delayed_orders,
    CAST(100.0 * AVG(CAST(delayed AS FLOAT)) AS DECIMAL(5,2))  AS delay_rate_pct
FROM dbo.OrderHistory
GROUP BY carrier
ORDER BY delay_rate_pct DESC;

-- Q2. Delay rate by sale day ------------------------------------------------
-- Does a promotion day actually break delivery, and by how much?
SELECT
    CASE WHEN is_sale_day = 1 THEN 'Sale day' ELSE 'Normal day' END AS day_type,
    COUNT(*)                                                   AS orders,
    SUM(CAST(delayed AS INT))                                  AS delayed_orders,
    CAST(100.0 * AVG(CAST(delayed AS FLOAT)) AS DECIMAL(5,2))  AS delay_rate_pct
FROM dbo.OrderHistory
GROUP BY is_sale_day
ORDER BY delay_rate_pct DESC;

-- Q3. Delay rate by warehouse backlog ---------------------------------------
-- Backlog is continuous, so bucket it: a per-value GROUP BY would return
-- dozens of tiny, unreadable groups.
WITH bucketed AS (
    SELECT
        delayed,
        CASE
            WHEN warehouse_backlog < 35 THEN '1. Low (<35)'
            WHEN warehouse_backlog < 45 THEN '2. Medium (35-44)'
            WHEN warehouse_backlog < 55 THEN '3. High (45-54)'
            ELSE                              '4. Critical (55+)'
        END AS backlog_band
    FROM dbo.OrderHistory
)
SELECT
    backlog_band,
    COUNT(*)                                                   AS orders,
    SUM(CAST(delayed AS INT))                                  AS delayed_orders,
    CAST(100.0 * AVG(CAST(delayed AS FLOAT)) AS DECIMAL(5,2))  AS delay_rate_pct
FROM bucketed
GROUP BY backlog_band
ORDER BY backlog_band;
