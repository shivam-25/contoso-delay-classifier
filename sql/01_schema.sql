-- Contoso Delay Classifier :: Area A :: schema + training view
-- Target: Azure SQL Database

IF OBJECT_ID('dbo.OrderHistory','U') IS NOT NULL DROP TABLE dbo.OrderHistory;
GO

CREATE TABLE dbo.OrderHistory (
    order_id          INT IDENTITY(1,1) PRIMARY KEY,
    carrier           NVARCHAR(32)  NOT NULL,
    distance_km       INT           NOT NULL,
    weight_kg         DECIMAL(8,2)  NOT NULL,
    items             INT           NOT NULL,
    order_hour        TINYINT       NOT NULL CHECK (order_hour BETWEEN 0 AND 23),
    is_sale_day       BIT           NOT NULL,
    warehouse_backlog INT           NOT NULL,
    weather_index     DECIMAL(5,3)  NOT NULL,
    delayed           BIT           NOT NULL
);
GO

-- Indexes chosen for the three analysis queries below (carrier/sale-day/backlog grouping).
CREATE INDEX IX_OrderHistory_carrier  ON dbo.OrderHistory(carrier)           INCLUDE (delayed);
CREATE INDEX IX_OrderHistory_saleday  ON dbo.OrderHistory(is_sale_day)       INCLUDE (delayed);
CREATE INDEX IX_OrderHistory_backlog  ON dbo.OrderHistory(warehouse_backlog) INCLUDE (delayed);
GO

-- Training view: the feature contract the model is trained on.
-- Kept as a view so the model and the analysis queries can never drift apart.
CREATE OR ALTER VIEW dbo.vw_DelayTraining AS
SELECT
    carrier,
    distance_km,
    weight_kg,
    items,
    order_hour,
    CAST(is_sale_day AS INT)       AS is_sale_day,
    warehouse_backlog,
    weather_index,
    CAST(delayed AS INT)           AS delayed
FROM dbo.OrderHistory;
GO
