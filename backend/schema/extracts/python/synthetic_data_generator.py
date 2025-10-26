"""
Example: Synthetic Data Generator for Python Extract

This script demonstrates generating synthetic test data using Python in the EXTRACT stage.
"""
import polars as pl
from datetime import datetime, timedelta
import random
from typing import Dict


def extract() -> Dict[str, pl.DataFrame]:
    """
    Generate synthetic customer and order data.

    Returns:
        Dictionary of DataFrames to be loaded into the pipeline
    """
    # Generate synthetic customers
    num_customers = 100

    customers = pl.DataFrame({
        "customer_id": range(1, num_customers + 1),
        "name": [f"Customer_{i}" for i in range(1, num_customers + 1)],
        "email": [f"customer_{i}@example.com" for i in range(1, num_customers + 1)],
        "tier": [random.choice(["bronze", "silver", "gold"]) for _ in range(num_customers)],
        "registration_date": [
            (datetime.now() - timedelta(days=random.randint(0, 365))).date()
            for _ in range(num_customers)
        ],
        "country": [random.choice(["USA", "UK", "Canada", "Germany", "France"]) for _ in range(num_customers)],
    })

    # Generate synthetic orders
    num_orders = 300

    orders = pl.DataFrame({
        "order_id": range(1, num_orders + 1),
        "customer_id": [random.randint(1, num_customers) for _ in range(num_orders)],
        "order_date": [
            (datetime.now() - timedelta(days=random.randint(0, 180))).date()
            for _ in range(num_orders)
        ],
        "amount": [round(random.uniform(10.0, 500.0), 2) for _ in range(num_orders)],
        "status": [random.choice(["pending", "completed", "cancelled"]) for _ in range(num_orders)],
        "product_category": [
            random.choice(["Electronics", "Clothing", "Books", "Home", "Sports"])
            for _ in range(num_orders)
        ],
    })

    # Generate metadata
    metadata = pl.DataFrame({
        "extraction_timestamp": [datetime.now()],
        "source": ["synthetic_generator"],
        "customer_count": [num_customers],
        "order_count": [num_orders],
    })

    return {
        "customers": customers,
        "orders": orders,
        "extraction_metadata": metadata,
    }
