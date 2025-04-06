# /// script
# requires-python = ">=3.8"
# dependencies = ["requests", "markdownify", "llm"]
# ///

"""
Verification script for conference data.

Provides tools to download source websites for verification and use LLMs to check data accuracy.
"""

import argparse
import difflib
import json
import sys
from pathlib import Path

# Third-party libraries
import llm
import markdownify
import requests

# --- Constants ---
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR
SOURCE_DIR = SCRIPT_DIR / "source"
PROMPTS_DIR = SCRIPT_DIR / "prompts"

OK_RESPONSE = "OK"
DEFAULT_CONFIRM_OPTIONS = "[y/N/a(bort)]"

BASE_PROMPT = """
The following JSON contains important dates for a conference, plus some metadata. Please verify the correctness of the dates in the JSON based on the content that comes after it.

If everything matches, output "OK_RESPONSE" and nothing else.

If some of the dates are incorrect, output the JSON with the corrected dates. Use the exact same JSON structure as the input.

If a date matches but has a slightly different name in the original, respect the original and treat this data as correct/unchanged.

If the JSON is missing some dates, please add them to the JSON but IT IS VERY IMPORTANT that you follow these rules:
- DO NOT add any dates that come after the Author Notification (or whatever similar thing it is named).
    - So, for example, the camera-ready due date should NOT be added.
- When adding dates, pay attention to how the dates are listed in the original JSON and try to match that as closely as possible
    - The description of the date should match the equivalent date from prior cycles/years
        - e.g., if it's called "Author Notification," use that instead of what you find in the page
    - The date should be formatted as YYYY-MM-DD


"""

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


def find_installment_for_year(data, year):
    """Finds the installment data for a specific year."""
    if not data or "installments" not in data:
        return None
    for installment in data["installments"]:
        if installment.get("year") == year:
            return installment
    return None


def find_website_for_year(data, year):
    """Finds the website URL for a specific year within the conference data."""
    installment = find_installment_for_year(data, year)
    return installment.get("website") if installment else None


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


def handle_download(conference_id, year) -> bool | None:
    """
    Handles the download logic for a single conference.

    Returns:
        True if download was successful.
        False if download failed or data loading failed.
        None if no website was found for the year (skipped).
    """
    data = load_conference_data(conference_id)
    if not data:
        return False # Error message already printed

    website_url = find_website_for_year(data, year)
    if not website_url:
        print(f"Info: No website found for conference '{conference_id}' year {year}. Skipping download.", file=sys.stderr)
        return None # Indicate skipped

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
    skipped_count = 0 # Count conferences skipped because no website was listed

    print(f"Attempting to download sources for {len(all_conference_ids)} conferences for year {year}...")

    for conf_id in all_conference_ids:
        result = handle_download(conf_id, year)
        if result is True:
            success_count += 1
        elif result is False:
            failure_count += 1 # Actual download or file error.
        elif result is None:
            skipped_count += 1 # No website listed, skipped.

    print("\nDownload Summary:")
    print(f"  Successfully downloaded: {success_count}")
    print(f"  Skipped (no website found): {skipped_count}")
    print(f"  Failed: {failure_count}")

    return 1 if failure_count > 0 else 0


def handle_prompts():
    """Generates prompt files from downloaded source HTML."""
    if not SOURCE_DIR.is_dir():
        print(f"Error: Source directory '{SOURCE_DIR}' not found. Run the 'download' command first?", file=sys.stderr)
        return 1

    # Find HTML files directly within year-specific subdirectories
    html_files = [p for p in SOURCE_DIR.glob("*/*.html") if p.parent.name.isdigit()]

    if not html_files:
        print(f"Info: No HTML source files found in year subdirectories within '{SOURCE_DIR}'.", file=sys.stderr)
        return 0 # Not an error, just nothing to do

    print(f"Found {len(html_files)} HTML source files. Generating prompts...")

    success_count = 0
    failure_count = 0

    for html_path in html_files:
        try:
            # Extract year and conference ID from path (structure: source/<year>/<conf_id>.html)
            year_str = html_path.parent.name
            conference_id = html_path.stem
            year = int(year_str) # Already filtered for digit parent dirs

            # Load conference data
            conf_data = load_conference_data(conference_id)
            if not conf_data:
                # Error already printed by load_conference_data
                failure_count += 1
                continue

            # Find the specific installment for the year
            installment_data = find_installment_for_year(conf_data, year)

            if not installment_data:
                print(f"Info: No installment data found for year {year} in '{conference_id}'. Skipping prompt generation for {html_path}.", file=sys.stderr)
                continue

            # Format the specific installment data as JSON string
            json_string = json.dumps(installment_data, indent=2)

            # Determine output path relative to SOURCE_DIR, then join with PROMPTS_DIR
            relative_path = html_path.relative_to(SOURCE_DIR)
            output_path = PROMPTS_DIR / relative_path.with_suffix(".txt")

            # Ensure output directory exists
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # Read HTML content
            with open(html_path, 'r', encoding='utf-8') as f_html:
                html_content = f_html.read()

            # Convert HTML to Markdown
            markdown_input = markdownify.markdownify(html_content, heading_style="ATX")

            # Construct the final prompt content
            full_content = f"{BASE_PROMPT}\n\n<json>\n{json_string}\n</json>\n\n<input>\n{markdown_input}\n</input>"

            # Write to output file
            with open(output_path, 'w', encoding='utf-8') as f_txt:
                f_txt.write(full_content)

            print(f"Generated prompt: '{output_path}'")
            success_count += 1

        except Exception as e:
            print(f"Error processing {html_path}: {e}", file=sys.stderr)
            failure_count += 1

    print("\nPrompt Generation Summary:")
    print(f"  Successfully generated: {success_count}")
    print(f"  Failed: {failure_count}")

    return 1 if failure_count > 0 else 0


def confirm_action(prompt_message, options=DEFAULT_CONFIRM_OPTIONS):
    """Asks the user for confirmation (Yes/No/Abort)."""
    while True:
        response = input(f"{prompt_message} {options}: ").lower().strip()
        if response.startswith('y'):
            return 'yes'
        elif response.startswith('n') or response == '': # Default to No
            return 'no'
        elif response.startswith('a'):
            return 'abort'
        else:
            print("Invalid input. Please enter 'y', 'n', or 'a'.")


def handle_llm(year):
    """Processes prompts for a given year using an LLM."""
    year_str = str(year)
    prompts_year_dir = PROMPTS_DIR / year_str
    if not prompts_year_dir.is_dir():
        print(f"Error: Prompts directory '{prompts_year_dir}' not found.", file=sys.stderr)
        print("Did you run the 'prompts' command first?", file=sys.stderr)
        return 1

    prompt_files = sorted(list(prompts_year_dir.glob("*.txt")))
    if not prompt_files:
        print(f"No prompt files (.txt) found in '{prompts_year_dir}'.", file=sys.stderr)
        return 0 # Not an error, just nothing to do

    print(f"Found {len(prompt_files)} prompt files for year {year}.")

    # Try to get a default LLM model
    try:
        # User might need to configure llm beforehand (e.g., `llm keys set openai`)
        # or specify a model alias they've set up.
        model = llm.get_model() # Attempts to get default or alias "llm"
        print(f"Using LLM model: {model.model_id}")
    except llm.UnknownModelError:
        print("Error: Default LLM model not found or configured.", file=sys.stderr)
        print("Please ensure the 'llm' CLI tool is installed, configured with API keys,", file=sys.stderr)
        print("and potentially set a default model or alias (e.g., `llm models default gpt-4`).", file=sys.stderr)
        print("See: https://llm.datasette.io/en/stable/setup.html", file=sys.stderr)
        return 1
    except Exception as e: # Catch other potential init errors
        print(f"Error initializing LLM model: {e}", file=sys.stderr)
        return 1

    processed_count = 0
    verified_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0

    for prompt_path in prompt_files:
        conference_id = prompt_path.stem
        print(f"\n--- Processing: {conference_id} ({year}) ---")

        confirmation = confirm_action(f"Run LLM for {conference_id} {year}?")
        if confirmation == 'abort':
            print("Aborting script.")
            sys.exit(1)
        elif confirmation == 'no':
            print("Skipping.")
            skipped_count += 1
            continue
        # If 'yes', proceed

        try:
            with open(prompt_path, 'r', encoding='utf-8') as f:
                prompt_content = f.read()

            # Send prompt to LLM
            print("Sending prompt to LLM...")
            response = model.prompt(prompt_content)
            response_text = response.text().strip()
            print(f"LLM Response received.") # Keep output concise

            if response_text == OK_RESPONSE:
                print(f"Verification OK for {conference_id} {year}.")
                verified_count += 1
            else:
                # Attempt to parse response as JSON, cleaning potential markdown fences
                try:
                    if response_text.startswith("```json"):
                        response_text = response_text[len("```json"):].strip()
                    if response_text.endswith("```"):
                        response_text = response_text[:-len("```")].strip()

                    llm_json_data = json.loads(response_text)

                    # Load original data to compare and update
                    original_data_path = DATA_DIR / f"{conference_id}.json"
                    original_conf_data = load_conference_data(conference_id)
                    if not original_conf_data:
                        print(f"Error: Cannot load original data file {original_data_path} to apply changes.", file=sys.stderr)
                        error_count += 1
                        continue # Skip to next prompt file

                    # Find the original installment index and data
                    original_installment_index = -1
                    original_installment_data = None
                    for i, inst in enumerate(original_conf_data.get("installments", [])):
                        if inst.get("year") == year:
                            original_installment_index = i
                            original_installment_data = inst
                            break

                    if original_installment_index == -1:
                        print(f"Error: Cannot find original installment for year {year} in {original_data_path}.", file=sys.stderr)
                        error_count += 1
                        continue # Skip to next prompt file

                    # Compare LLM data with original installment data
                    if llm_json_data == original_installment_data:
                        print(f"Verification OK (LLM JSON matches existing data) for {conference_id} {year}.")
                        verified_count += 1
                    else:
                        # Data differs, show diff and ask to save
                        print("LLM proposed changes (JSON differs from original):")
                        original_json_str = json.dumps(original_installment_data, indent=2, sort_keys=True).splitlines()
                        llm_json_str = json.dumps(llm_json_data, indent=2, sort_keys=True).splitlines()
                        diff = difflib.unified_diff(
                            original_json_str, llm_json_str,
                            fromfile=f"Original {conference_id} {year}",
                            tofile=f"LLM Proposed {conference_id} {year}",
                            lineterm=""
                        )
                        diff_lines = list(diff)

                        if diff_lines:
                            for line in diff_lines:
                                print(line)
                        else:
                             print("(Objects differ but no textual difference found - check data types or ordering?)")
                        print("\n") # Add newline after diff

                        # Confirm before saving
                        save_confirmation = confirm_action(f"Apply proposed changes for {conference_id} {year} to '{original_data_path.name}'?")
                        if save_confirmation == 'abort':
                            print("Aborting script.")
                            sys.exit(1)
                        elif save_confirmation == 'yes':
                            # Replace the old installment with the new one
                            original_conf_data["installments"][original_installment_index] = llm_json_data

                            # Save the updated data
                            try:
                                with open(original_data_path, 'w', encoding='utf-8') as f:
                                    json.dump(original_conf_data, f, indent=2, ensure_ascii=False)
                                    f.write("\n") # Add trailing newline
                                print(f"Successfully updated '{original_data_path}'.")
                                updated_count += 1
                            except IOError as e:
                                print(f"Error writing updated file {original_data_path}: {e}", file=sys.stderr)
                                error_count += 1
                        else: # 'no'
                            print("Changes discarded.")
                            skipped_count += 1

                except json.JSONDecodeError:
                    print(f"Error: LLM response for {conference_id} {year} was not '{OK_RESPONSE}' and could not be parsed as JSON.", file=sys.stderr)
                    print("LLM Raw Output:")
                    print("-" * 20)
                    print(response_text)
                    print("-" * 20)
                    error_count += 1
                except Exception as e: # Catch other potential errors during diff/save
                     print(f"An unexpected error occurred processing the LLM response for {conference_id} {year}: {e}", file=sys.stderr)
                     error_count += 1

        except Exception as e: # Catch errors during LLM call or file reading
            print(f"Error during processing for {prompt_path.name}: {e}", file=sys.stderr)
            error_count += 1

        processed_count += 1 # Increment regardless of skip/error within the loop

    print("\nLLM Processing Summary:")
    print(f"  Prompts processed: {processed_count}")
    print(f"  Verified ('OK'): {verified_count}")
    print(f"  Updated: {updated_count}")
    print(f"  Skipped/Discarded: {skipped_count}")
    print(f"  Errors: {error_count}")

    return 1 if error_count > 0 else 0


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

    # Prompts subcommand
    parser_prompts = subparsers.add_parser("prompts", help="Generate prompt files from downloaded source HTML.")
    # No arguments needed for prompts subcommand

    # LLM subcommand
    parser_llm = subparsers.add_parser("llm", help="Verify/update data using LLM and generated prompts.")
    parser_llm.add_argument(
        "year",
        type=int,
        help="The year to process prompts for."
    )

    args = parser.parse_args()

    exit_code = 0
    if args.command == "download":
        if args.conference_id == "_all":
            # handle_download_all returns 0 on success, 1 on failure
            exit_code = handle_download_all(args.year)
        else:
            result = handle_download(args.conference_id, args.year)
            # Treat False (download/data error) as failure, True/None (success/skipped) as success
            exit_code = 0 if result in [True, None] else 1
    elif args.command == "prompts":
        # handle_prompts returns 0 on success, 1 on failure
        exit_code = handle_prompts()
    elif args.command == "llm":
        # handle_llm returns 0 on success (or partial success), 1 if errors occurred
        exit_code = handle_llm(args.year)
    # No 'else' needed as subparsers are required

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
