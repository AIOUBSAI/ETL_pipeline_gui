"""
Example: API Data Extractor for Python Extract

This script demonstrates fetching data from REST APIs with authentication
and error handling.
"""
import polars as pl
import requests
from datetime import datetime, timedelta
from typing import Dict, Optional
import time


def extract() -> Dict[str, pl.DataFrame]:
    """
    Extract data from external APIs.

    Returns:
        Dictionary of DataFrames to be loaded into the pipeline
    """
    # Configuration (in production, use environment variables)
    API_BASE_URL = "https://api.example.com/v1"
    API_KEY = "your_api_key_here"  # Use environment variables in production

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    # Example 1: Fetch customers from API
    print("Fetching customers from API...")
    customers_data = fetch_with_retry(
        f"{API_BASE_URL}/customers",
        headers=headers,
        max_retries=3
    )

    if customers_data:
        customers_df = pl.DataFrame(customers_data)
        print(f"  Fetched {len(customers_df)} customers")
    else:
        # Return empty DataFrame with schema if API fails
        customers_df = pl.DataFrame({
            "customer_id": [],
            "name": [],
            "email": [],
            "created_at": []
        })
        print("  No customers fetched (API error)")

    # Example 2: Fetch orders for date range
    print("Fetching orders from API...")
    start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    end_date = datetime.now().strftime("%Y-%m-%d")

    orders_data = fetch_with_retry(
        f"{API_BASE_URL}/orders",
        headers=headers,
        params={"start_date": start_date, "end_date": end_date},
        max_retries=3
    )

    if orders_data:
        orders_df = pl.DataFrame(orders_data)

        # Data transformations
        orders_df = orders_df.with_columns([
            pl.col("order_date").str.strptime(pl.Date, "%Y-%m-%d"),
            pl.col("amount").cast(pl.Float64)
        ])

        print(f"  Fetched {len(orders_df)} orders")
    else:
        orders_df = pl.DataFrame({
            "order_id": [],
            "customer_id": [],
            "order_date": [],
            "amount": []
        })
        print("  No orders fetched (API error)")

    # Example 3: Generate extraction metadata
    metadata_df = pl.DataFrame({
        "extraction_timestamp": [datetime.now()],
        "source": ["api_extractor"],
        "api_base_url": [API_BASE_URL],
        "customers_count": [len(customers_df)],
        "orders_count": [len(orders_df)],
        "date_range_start": [start_date],
        "date_range_end": [end_date]
    })

    return {
        "customers": customers_df,
        "orders": orders_df,
        "extraction_metadata": metadata_df
    }


def fetch_with_retry(
    url: str,
    headers: Dict[str, str],
    params: Optional[Dict[str, str]] = None,
    max_retries: int = 3,
    retry_delay: int = 2
) -> Optional[list]:
    """
    Fetch data from API with retry logic.

    Args:
        url: API endpoint URL
        headers: Request headers
        params: Query parameters
        max_retries: Maximum number of retry attempts
        retry_delay: Delay between retries in seconds

    Returns:
        List of records or None if all retries fail
    """
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, params=params, timeout=30)
            response.raise_for_status()

            data = response.json()

            # Handle different response formats
            if isinstance(data, dict):
                # Response might have data in a 'data' or 'results' key
                return data.get("data") or data.get("results") or [data]
            elif isinstance(data, list):
                return data
            else:
                print(f"  Warning: Unexpected response format: {type(data)}")
                return None

        except requests.exceptions.RequestException as e:
            print(f"  Attempt {attempt + 1}/{max_retries} failed: {e}")

            if attempt < max_retries - 1:
                print(f"  Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                print(f"  All retry attempts failed for {url}")
                return None

        except Exception as e:
            print(f"  Unexpected error: {e}")
            return None

    return None


# Example usage in pipeline YAML:
#
# extract_api_data:
#   stage: extract
#   runner: python_extract
#   input:
#     python_file: "schema/sources/python/api_extractor_example.py"
#     output:
#       - source_df: "customers"
#         table: "api_customers"
#       - source_df: "orders"
#         table: "api_orders"
#       - source_df: "extraction_metadata"
#         table: "api_metadata"
#   output:
#     table: "api_customers"
