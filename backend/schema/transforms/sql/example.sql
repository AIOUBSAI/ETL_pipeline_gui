-- Example SQL transformation
-- This creates a aggregated view of the clean data

CREATE OR REPLACE TABLE analytics.sql_file_result AS
SELECT
  category,
  COUNT(*) as total_records,
  AVG(adjusted_value) as avg_adjusted_value,
  MIN(adjusted_value) as min_value,
  MAX(adjusted_value) as max_value,
  SUM(adjusted_value) as total_value
FROM staging.clean_data
GROUP BY category
ORDER BY total_value DESC;
