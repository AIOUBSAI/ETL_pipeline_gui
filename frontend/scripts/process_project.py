#!/usr/bin/env python3
"""
Sample Python script for processing projects.
This script receives project name and path as arguments and displays them.
"""

import sys
import os
import time
from datetime import datetime


def main():
    """Main function to process project."""
    # Check if we have the required arguments
    if len(sys.argv) < 3:
        print("Error: Missing arguments", file=sys.stderr)
        print("Usage: python process_project.py <project_name> <project_path>", file=sys.stderr)
        sys.exit(1)

    project_name = sys.argv[1]
    project_path = sys.argv[2]

    # Display header
    print("=" * 60)
    print("PROJECT PROCESSING SCRIPT")
    print("=" * 60)
    print()

    # Display project information
    print(f"Project Name: {project_name}")
    print(f"Project Path: {project_path}")
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # Check if path exists
    if not os.path.exists(project_path):
        print(f"Warning: Project path does not exist: {project_path}", file=sys.stderr)
        sys.exit(1)

    # Get directory contents
    print("Project Contents:")
    print("-" * 60)
    try:
        items = os.listdir(project_path)
        if not items:
            print("  (empty directory)")
        else:
            # Separate directories and files
            dirs = [item for item in items if os.path.isdir(os.path.join(project_path, item))]
            files = [item for item in items if os.path.isfile(os.path.join(project_path, item))]

            if dirs:
                print(f"\nDirectories ({len(dirs)}):")
                for directory in sorted(dirs):
                    print(f"  📁 {directory}")

            if files:
                print(f"\nFiles ({len(files)}):")
                for file in sorted(files):
                    file_path = os.path.join(project_path, file)
                    file_size = os.path.getsize(file_path)
                    print(f"  📄 {file} ({format_size(file_size)})")

    except PermissionError:
        print(f"Error: Permission denied accessing: {project_path}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error reading directory: {str(e)}", file=sys.stderr)
        sys.exit(1)

    print()
    print("-" * 60)

    # Simulate some processing
    print("\nProcessing project...")
    for i in range(3):
        time.sleep(0.5)
        print(f"  Step {i + 1}/3 completed")

    print()
    print("=" * 60)
    print("✅ PROJECT PROCESSING COMPLETED SUCCESSFULLY")
    print("=" * 60)

    sys.exit(0)


def format_size(size_bytes):
    """Format file size in human-readable format."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} TB"


if __name__ == "__main__":
    main()
