# /// script
# requires-python = ">=3.8"
# dependencies = ["jsonschema"]
# ///

"""
Validation script for conference data files against the schema.
"""

import json
import sys
from pathlib import Path

# Third-party libraries
import jsonschema
from jsonschema import validate

# --- Constants ---
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR
SCHEMA_FILE = DATA_DIR / "schema.json"
EXCLUDE_FILES = {SCHEMA_FILE.name, "index.json"}


def load_json(file_path):
    """Loads JSON data from a file."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error: Could not decode JSON from {file_path}: {e}", file=sys.stderr)
        return None
    except IOError as e:
        print(f"Error reading file {file_path}: {e}", file=sys.stderr)
        return None


def validate_file(file_path, schema):
    """Validates a single JSON file against the schema."""
    print(f"Validating {file_path.name}...", end=" ")
    data = load_json(file_path)
    if data is None:
        print("FAILED (Load Error)")
        return False  # Error loading the file

    try:
        validate(instance=data, schema=schema)
        print("OK")
        return True
    except jsonschema.exceptions.ValidationError as e:
        print("FAILED")
        print(f"  Error: {e.message}", file=sys.stderr)
        # Optionally print more details like the path in the JSON:
        # print(f"  Path: {list(e.path)}")
        return False
    except Exception as e:
        print("FAILED (Unexpected Validation Error)")
        print(f"  Unexpected error during validation: {e}", file=sys.stderr)
        return False


def main():
    """Main validation logic."""
    print(f"Loading schema from {SCHEMA_FILE}...")
    schema = load_json(SCHEMA_FILE)
    if schema is None:
        sys.exit(1)  # Exit if schema cannot be loaded

    print(f"Scanning {DATA_DIR} for conference JSON files...")
    json_files = [
        f
        for f in DATA_DIR.glob("*.json")
        if f.is_file() and f.name not in EXCLUDE_FILES
    ]

    if not json_files:
        print("No conference JSON files found to validate.", file=sys.stderr)
        sys.exit(0)  # Not an error, just nothing to do

    print(f"Found {len(json_files)} files to validate.")

    all_valid = True
    for file_path in sorted(json_files):
        is_valid = validate_file(file_path, schema)
        if not is_valid:
            all_valid = False

    print("\nValidation finished.")
    if all_valid:
        print("All files are valid.")
        sys.exit(0)
    else:
        print("Some files failed validation.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
