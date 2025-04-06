# /// script
# requires-python = ">=3.8"
# requires = ["requests"]
# ///

"""
Verification script for conference data.

Provides tools to download source websites for verification.
"""

import argparse
import json
import sys
from pathlib import Path
import requests

# Base directory of the script, assuming it's in the 'data' directory
SCRIPT_DIR = Path(__file__).parent
BASE_DIR = SCRIPT_DIR.parent # Project root
DATA_DIR = SCRIPT_DIR
SOURCE_DIR = BASE_DIR / "source"


def load_conference_data(conference_id):
    """Loads the JSON data for a specific conference."""
    json_path = DATA_DIR / f"{conference_id}.json"
    if not json_path.exists():
        print(f"Error: Data file not found for conference '{conference_id}' at {json_path}", file=sys.stderr)
        return None
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {json_path}", file=sys.stderr)
        return None
    except IOError as e:
        print(f"Error reading file {json_path}: {e}", file=sys.stderr)
        return None


def find_website_for_year(data, year):
    """Finds the website URL for a specific year within the conference data."""
    if not data or "installments" not in data:
        return None

    for installment in data["installments"]:
        if installment.get("year") == year:
            return installment.get("website")
    return None


def download_and_save(url, output_path):
    """Downloads content from a URL and saves it to a file."""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(response.text)
        print(f"Successfully downloaded '{url}' to '{output_path}'")
        return True

    except requests.exceptions.RequestException as e:
        print(f"Error downloading {url}: {e}", file=sys.stderr)
        return False
    except IOError as e:
        print(f"Error saving file to {output_path}: {e}", file=sys.stderr)
        return False


def handle_download(conference_id, year):
    """Handles the download logic for a single conference."""
    data = load_conference_data(conference_id)
    if not data:
        return False # Error message already printed by load_conference_data

    website_url = find_website_for_year(data, year)
    if not website_url:
        print(f"Warning: No website found for conference '{conference_id}' year {year}.", file=sys.stderr)
        return False # Not necessarily an error, but nothing to download

    output_dir = SOURCE_DIR / str(year)
    output_file = output_dir / f"{conference_id}.html"

    return download_and_save(website_url, output_file)


def handle_download_all(year):
    """Handles downloading data for all conferences for a given year."""
    index_path = DATA_DIR / "index.json"
    if not index_path.exists():
        print(f"Error: index.json not found at {index_path}", file=sys.stderr)
        return 1

    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            all_conference_ids = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error reading or parsing {index_path}: {e}", file=sys.stderr)
        return 1

    success_count = 0
    failure_count = 0
    skipped_count = 0

    print(f"Attempting to download sources for {len(all_conference_ids)} conferences for year {year}...")

    for conf_id in all_conference_ids:
        result = handle_download(conf_id, year)
        if result is True:
            success_count += 1
        elif result is False:
            # Distinguish between actual download failures and missing websites
            data = load_conference_data(conf_id)
            if data and not find_website_for_year(data, year):
                skipped_count += 1 # No website listed, skipped.
            else:
                failure_count += 1 # Actual download or file error.

    print("\nDownload Summary:")
    print(f"  Successfully downloaded: {success_count}")
    print(f"  Skipped (no website found): {skipped_count}")
    print(f"  Failed: {failure_count}")

    return 1 if failure_count > 0 else 0


def main():
    """Main function to parse arguments and dispatch commands."""
    parser = argparse.ArgumentParser(description="Verify conference data.")
    subparsers = parser.add_subparsers(dest="command", required=True, help="Sub-command help")

    # Download subcommand
    parser_download = subparsers.add_parser("download", help="Download conference website source.")
    parser_download.add_argument(
        "conference_id",
        type=str,
        help="The ID of the conference (e.g., 'chi') or '_all' to download all conferences."
    )
    parser_download.add_argument(
        "year",
        type=int,
        help="The year of the conference installment."
    )

    args = parser.parse_args()

    exit_code = 0
    if args.command == "download":
        if args.conference_id == "_all":
            exit_code = handle_download_all(args.year)
        else:
            if not handle_download(args.conference_id, args.year):
                # If handle_download returns False, it indicates a failure or skip.
                # We consider it an error exit code unless it was just a skip.
                data = load_conference_data(args.conference_id)
                if not data or find_website_for_year(data, args.year):
                    exit_code = 1 # It was a real error, not just missing website
    else:
        # Should not happen due to `required=True` on subparsers
        print(f"Unknown command: {args.command}", file=sys.stderr)
        exit_code = 1

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
