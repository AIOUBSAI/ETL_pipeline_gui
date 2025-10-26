"""
Column-level lineage tracking for pipeline transformations

Tracks data flow from sources through transformations to outputs
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Set


class LineageNodeType(str, Enum):
    """Type of lineage node"""
    SOURCE = "source"           # Raw data source (file, table, API)
    TRANSFORM = "transform"     # Transformation step
    OUTPUT = "output"           # Final output (table, file)


class TransformationType(str, Enum):
    """Type of transformation"""
    SELECT = "select"           # Column selection/projection
    FILTER = "filter"           # Row filtering
    AGGREGATE = "aggregate"     # Aggregation (GROUP BY)
    JOIN = "join"              # Join operation
    UNION = "union"            # Union/concatenation
    WINDOW = "window"          # Window function
    CAST = "cast"              # Type casting
    RENAME = "rename"          # Column rename
    COMPUTE = "compute"        # Computed/derived column
    SQL = "sql"                # SQL transformation
    PYTHON = "python"          # Python UDF


@dataclass
class ColumnLineage:
    """
    Lineage for a single column

    Tracks upstream dependencies and transformations
    """
    column_name: str
    dataset_name: str
    node_type: LineageNodeType
    upstream_columns: List[tuple[str, str]] = field(default_factory=list)  # [(dataset, column), ...]
    transformation_type: Optional[TransformationType] = None
    transformation_expr: Optional[str] = None  # SQL/Python expression
    transformation_desc: Optional[str] = None
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "column_name": self.column_name,
            "dataset_name": self.dataset_name,
            "node_type": self.node_type.value,
            "upstream_columns": self.upstream_columns,
            "transformation_type": self.transformation_type.value if self.transformation_type else None,
            "transformation_expr": self.transformation_expr,
            "transformation_desc": self.transformation_desc,
            "tags": self.tags
        }


@dataclass
class DatasetLineage:
    """
    Lineage for an entire dataset

    Contains column-level lineage and dataset metadata
    """
    dataset_name: str
    node_type: LineageNodeType
    columns: Dict[str, ColumnLineage] = field(default_factory=dict)
    upstream_datasets: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    run_id: Optional[str] = None
    timestamp: Optional[datetime] = None

    def add_column(self, col_lineage: ColumnLineage):
        """Add column lineage"""
        self.columns[col_lineage.column_name] = col_lineage

    def get_upstream_datasets(self) -> Set[str]:
        """Get all upstream datasets"""
        upstream = set(self.upstream_datasets)
        for col_lineage in self.columns.values():
            for dataset, _ in col_lineage.upstream_columns:
                upstream.add(dataset)
        return upstream

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "dataset_name": self.dataset_name,
            "node_type": self.node_type.value,
            "columns": {name: col.to_dict() for name, col in self.columns.items()},
            "upstream_datasets": list(self.get_upstream_datasets()),
            "metadata": self.metadata,
            "run_id": self.run_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


class LineageTracker:
    """
    Lineage tracking system

    Examples:
        >>> tracker = LineageTracker()
        >>>
        >>> # Track source
        >>> tracker.track_source("raw_users", ["id", "name", "email"])
        >>>
        >>> # Track transformation
        >>> tracker.track_transform(
        ...     output_dataset="clean_users",
        ...     output_columns={
        ...         "user_id": ColumnLineage(
        ...             column_name="user_id",
        ...             dataset_name="clean_users",
        ...             node_type=LineageNodeType.TRANSFORM,
        ...             upstream_columns=[("raw_users", "id")],
        ...             transformation_type=TransformationType.RENAME
        ...         ),
        ...         "email_domain": ColumnLineage(
        ...             column_name="email_domain",
        ...             dataset_name="clean_users",
        ...             node_type=LineageNodeType.TRANSFORM,
        ...             upstream_columns=[("raw_users", "email")],
        ...             transformation_type=TransformationType.COMPUTE,
        ...             transformation_expr="split_part(email, '@', 2)"
        ...         )
        ...     }
        ... )
    """

    def __init__(self):
        self.datasets: Dict[str, DatasetLineage] = {}
        self.run_id: Optional[str] = None

    def set_run_id(self, run_id: str):
        """Set run ID for all tracked datasets"""
        self.run_id = run_id

    def track_source(
        self,
        dataset_name: str,
        columns: List[str],
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Track source dataset

        Args:
            dataset_name: Name of source dataset
            columns: List of column names
            metadata: Optional metadata (file_path, table_name, etc.)
        """
        lineage = DatasetLineage(
            dataset_name=dataset_name,
            node_type=LineageNodeType.SOURCE,
            metadata=metadata or {},
            run_id=self.run_id,
            timestamp=datetime.now()
        )

        for col in columns:
            lineage.add_column(
                ColumnLineage(
                    column_name=col,
                    dataset_name=dataset_name,
                    node_type=LineageNodeType.SOURCE
                )
            )

        self.datasets[dataset_name] = lineage

    def track_transform(
        self,
        output_dataset: str,
        output_columns: Dict[str, ColumnLineage],
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Track transformation

        Args:
            output_dataset: Name of output dataset
            output_columns: Mapping of column name to ColumnLineage
            metadata: Optional metadata
        """
        lineage = DatasetLineage(
            dataset_name=output_dataset,
            node_type=LineageNodeType.TRANSFORM,
            metadata=metadata or {},
            run_id=self.run_id,
            timestamp=datetime.now()
        )

        for col_name, col_lineage in output_columns.items():
            lineage.add_column(col_lineage)

        self.datasets[output_dataset] = lineage

    def track_output(
        self,
        output_dataset: str,
        columns: Dict[str, ColumnLineage],
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Track final output"""
        lineage = DatasetLineage(
            dataset_name=output_dataset,
            node_type=LineageNodeType.OUTPUT,
            metadata=metadata or {},
            run_id=self.run_id,
            timestamp=datetime.now()
        )

        for col_name, col_lineage in columns.items():
            lineage.add_column(col_lineage)

        self.datasets[output_dataset] = lineage

    def track_simple_transform(
        self,
        output_dataset: str,
        input_dataset: str,
        column_mapping: Dict[str, str],  # output_col -> input_col
        transformation_type: TransformationType = TransformationType.SELECT,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Track simple 1:1 column transformations

        Args:
            output_dataset: Output dataset name
            input_dataset: Input dataset name
            column_mapping: Mapping of output column to input column
            transformation_type: Type of transformation
            metadata: Optional metadata

        Examples:
            >>> # Simple column rename
            >>> tracker.track_simple_transform(
            ...     "output", "input",
            ...     {"user_id": "id", "user_name": "name"},
            ...     TransformationType.RENAME
            ... )
        """
        output_columns = {}

        for output_col, input_col in column_mapping.items():
            output_columns[output_col] = ColumnLineage(
                column_name=output_col,
                dataset_name=output_dataset,
                node_type=LineageNodeType.TRANSFORM,
                upstream_columns=[(input_dataset, input_col)],
                transformation_type=transformation_type
            )

        self.track_transform(output_dataset, output_columns, metadata)

    def get_column_lineage(self, dataset_name: str, column_name: str) -> Optional[ColumnLineage]:
        """Get lineage for specific column"""
        dataset = self.datasets.get(dataset_name)
        if dataset:
            return dataset.columns.get(column_name)
        return None

    def get_upstream_columns(
        self, dataset_name: str, column_name: str, recursive: bool = True
    ) -> List[tuple[str, str]]:
        """
        Get all upstream columns for a given column

        Args:
            dataset_name: Dataset name
            column_name: Column name
            recursive: If True, traverse all the way to sources

        Returns:
            List of (dataset, column) tuples
        """
        col_lineage = self.get_column_lineage(dataset_name, column_name)
        if not col_lineage:
            return []

        upstream = col_lineage.upstream_columns.copy()

        if recursive:
            all_upstream = []
            for up_dataset, up_col in upstream:
                all_upstream.append((up_dataset, up_col))
                # Recurse
                nested = self.get_upstream_columns(up_dataset, up_col, recursive=True)
                all_upstream.extend(nested)
            return all_upstream

        return upstream

    def get_downstream_columns(
        self, dataset_name: str, column_name: str
    ) -> List[tuple[str, str]]:
        """
        Get all downstream columns that depend on given column

        Returns:
            List of (dataset, column) tuples
        """
        downstream = []

        for ds_name, ds_lineage in self.datasets.items():
            for col_name, col_lineage in ds_lineage.columns.items():
                if (dataset_name, column_name) in col_lineage.upstream_columns:
                    downstream.append((ds_name, col_name))

        return downstream

    def get_lineage_graph(self) -> Dict[str, Any]:
        """
        Get lineage as graph structure (nodes + edges)

        Returns:
            Dict with 'nodes' and 'edges' for visualization
        """
        nodes = []
        edges = []

        for ds_name, ds_lineage in self.datasets.items():
            # Add dataset node
            nodes.append({
                "id": ds_name,
                "type": "dataset",
                "node_type": ds_lineage.node_type.value,
                "label": ds_name
            })

            for col_name, col_lineage in ds_lineage.columns.items():
                # Add column node
                col_id = f"{ds_name}.{col_name}"
                nodes.append({
                    "id": col_id,
                    "type": "column",
                    "node_type": col_lineage.node_type.value,
                    "label": col_name,
                    "dataset": ds_name,
                    "transformation": col_lineage.transformation_type.value if col_lineage.transformation_type else None,
                    "expression": col_lineage.transformation_expr
                })

                # Add edges from upstream columns
                for up_dataset, up_col in col_lineage.upstream_columns:
                    up_col_id = f"{up_dataset}.{up_col}"
                    edges.append({
                        "source": up_col_id,
                        "target": col_id,
                        "type": col_lineage.transformation_type.value if col_lineage.transformation_type else "unknown"
                    })

        return {
            "nodes": nodes,
            "edges": edges,
            "metadata": {
                "run_id": self.run_id,
                "generated_at": datetime.now().isoformat()
            }
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert entire lineage to dictionary"""
        return {
            "run_id": self.run_id,
            "datasets": {name: ds.to_dict() for name, ds in self.datasets.items()}
        }

    def to_json(self, file_path: Optional[Path] = None, indent: int = 2) -> str:
        """
        Export lineage to JSON

        Args:
            file_path: Optional file to write JSON
            indent: JSON indentation

        Returns:
            JSON string
        """
        data = self.to_dict()
        json_str = json.dumps(data, indent=indent, default=str)

        if file_path:
            file_path.write_text(json_str, encoding="utf-8")

        return json_str

    @classmethod
    def from_json(cls, json_str: str) -> LineageTracker:
        """Load lineage from JSON string"""
        data = json.loads(json_str)
        tracker = cls()
        tracker.run_id = data.get("run_id")

        for ds_name, ds_data in data.get("datasets", {}).items():
            columns = {}
            for col_name, col_data in ds_data.get("columns", {}).items():
                columns[col_name] = ColumnLineage(
                    column_name=col_data["column_name"],
                    dataset_name=col_data["dataset_name"],
                    node_type=LineageNodeType(col_data["node_type"]),
                    upstream_columns=col_data.get("upstream_columns", []),
                    transformation_type=TransformationType(col_data["transformation_type"]) if col_data.get("transformation_type") else None,
                    transformation_expr=col_data.get("transformation_expr"),
                    transformation_desc=col_data.get("transformation_desc"),
                    tags=col_data.get("tags", [])
                )

            dataset_lineage = DatasetLineage(
                dataset_name=ds_data["dataset_name"],
                node_type=LineageNodeType(ds_data["node_type"]),
                columns=columns,
                metadata=ds_data.get("metadata", {}),
                run_id=ds_data.get("run_id"),
                timestamp=datetime.fromisoformat(ds_data["timestamp"]) if ds_data.get("timestamp") else None
            )

            tracker.datasets[ds_name] = dataset_lineage

        return tracker


def track_sql_lineage(
    sql: str,
    output_dataset: str,
    output_columns: List[str],
    input_datasets: Optional[Dict[str, List[str]]] = None
) -> Dict[str, ColumnLineage]:
    """
    Parse SQL and generate basic lineage

    This is a simplified implementation. Full SQL parsing requires sqlglot/sqlparse.

    Args:
        sql: SQL query string
        output_dataset: Output dataset name
        output_columns: List of output column names
        input_datasets: Optional mapping of {dataset_name: [columns]}

    Returns:
        Dict of output column lineages
    """
    # Simplified lineage - just mark as SQL transform
    # Full implementation would parse SELECT, JOIN, GROUP BY, etc.

    lineages = {}
    for col in output_columns:
        lineages[col] = ColumnLineage(
            column_name=col,
            dataset_name=output_dataset,
            node_type=LineageNodeType.TRANSFORM,
            transformation_type=TransformationType.SQL,
            transformation_expr=sql[:200]  # Truncate for storage
        )

    return lineages
