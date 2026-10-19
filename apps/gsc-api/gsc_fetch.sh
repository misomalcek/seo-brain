#!/bin/bash
# =============================================================================
# GSC Data Fetcher v2
#
# Použitie:
#   ./gsc_fetch.sh <property> <typ> [date-range] [--format csv|json]
#   ./gsc_fetch.sh --list                    # Zoznam properties
#   ./gsc_fetch.sh --help                    # Pomoc
#
# Príklady:
#   ./gsc_fetch.sh example.com all last-30-days
#   ./gsc_fetch.sh aisvet.sk queries 2026-01-01 2026-01-15 --format csv
#   ./gsc_fetch.sh example.com pages last-7-days
# =============================================================================

# Konfigurácia
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_FILE="/opt/team-brain/gsc/.gsc_tokens.json"
OUTPUT_DIR="/opt/team-brain/gsc/exports"
CLIENT_ID="${GSC_CLIENT_ID}"
CLIENT_SECRET="${GSC_CLIENT_SECRET:?set GSC_CLIENT_SECRET in env}"

# Známe properties (pridaj ďalšie podľa potreby)
PROPERTIES=(
    "aisvet.sk"
    "example.com"
)

# Farby
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# =============================================================================
# Funkcie
# =============================================================================

show_help() {
    echo "GSC Data Fetcher v2"
    echo ""
    echo "Použitie:"
    echo "  ./gsc_fetch.sh <property> <typ> [date-range] [--format csv|json]"
    echo ""
    echo "Typy dát:"
    echo "  all          - všetky typy (queries, pages, pages_queries, countries, devices)"
    echo "  queries      - keywords performance"
    echo "  pages        - URL performance"
    echo "  pages_queries - kombinácia URL + keyword"
    echo "  countries    - krajiny"
    echo "  devices      - zariadenia"
    echo ""
    echo "Date range:"
    echo "  last-7-days, last-30-days, last-90-days, last-16-months"
    echo "  YYYY-MM-DD YYYY-MM-DD  (štart koniec)"
    echo ""
    echo "Príklady:"
    echo "  ./gsc_fetch.sh example.com all last-30-days"
    echo "  ./gsc_fetch.sh aisvet.sk queries 2026-01-01 2026-01-15 --format csv"
    echo "  ./gsc_fetch.sh --list"
}

list_properties() {
    echo -e "${CYAN}Známe GSC properties:${NC}"
    for prop in "${PROPERTIES[@]}"; do
        echo "  - $prop"
    done
    echo ""
    echo "Tip: Pridaj ďalšie properties priamo v skripte (pole PROPERTIES)"
}

refresh_access_token() {
    if [ ! -f "$TOKEN_FILE" ]; then
        echo -e "${RED}ERROR: Chýba token súbor ($TOKEN_FILE)${NC}"
        echo "Potrebuješ najprv autorizáciu cez OAuth."
        exit 1
    fi

    REFRESH_TOKEN=$(python3 -c "import json; print(json.load(open('$TOKEN_FILE'))['refresh_token'])")

    RESPONSE=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
        -d "client_id=$CLIENT_ID" \
        -d "client_secret=$CLIENT_SECRET" \
        -d "refresh_token=$REFRESH_TOKEN" \
        -d "grant_type=refresh_token")

    ACCESS_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

    if [ -z "$ACCESS_TOKEN" ]; then
        echo -e "${RED}ERROR: Nepodarilo sa získať access token${NC}"
        echo "$RESPONSE"
        exit 1
    fi
}

parse_date_range() {
    local range="$1"
    local extra="$2"

    END_DATE=$(date +%Y-%m-%d)

    case "$range" in
        last-7-days)
            START_DATE=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d "7 days ago" +%Y-%m-%d)
            ;;
        last-30-days)
            START_DATE=$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d "30 days ago" +%Y-%m-%d)
            ;;
        last-90-days)
            START_DATE=$(date -v-90d +%Y-%m-%d 2>/dev/null || date -d "90 days ago" +%Y-%m-%d)
            ;;
        last-16-months)
            START_DATE=$(date -v-16m +%Y-%m-%d 2>/dev/null || date -d "16 months ago" +%Y-%m-%d)
            ;;
        [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])
            START_DATE="$range"
            if [[ "$extra" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
                END_DATE="$extra"
            fi
            ;;
        *)
            # Default: last 30 days
            START_DATE=$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d "30 days ago" +%Y-%m-%d)
            ;;
    esac
}

fetch_data() {
    local dimensions="$1"
    local name="$2"

    ENCODED_SITE=$(python3 -c "import urllib.parse; print(urllib.parse.quote('sc-domain:$PROPERTY', safe=''))")

    local json_file="$EXPORT_SUBDIR/${name}.json"

    curl -s -X POST "https://searchconsole.googleapis.com/webmasters/v3/sites/${ENCODED_SITE}/searchAnalytics/query" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"startDate\": \"$START_DATE\",
            \"endDate\": \"$END_DATE\",
            \"dimensions\": $dimensions,
            \"rowLimit\": 25000
        }" > "$json_file"

    # Spočítaj riadky
    local row_count=$(python3 -c "import json; data=json.load(open('$json_file')); print(len(data.get('rows',[])))" 2>/dev/null || echo "0")

    # CSV export ak treba
    if [ "$FORMAT" = "csv" ]; then
        local csv_file="$EXPORT_SUBDIR/${name}.csv"
        python3 << EOF
import json
import csv

data = json.load(open('$json_file'))
rows = data.get('rows', [])

if rows:
    with open('$csv_file', 'w', newline='', encoding='utf-8') as f:
        # Header based on dimensions
        dims = $dimensions
        headers = dims + ['clicks', 'impressions', 'ctr', 'position']
        writer = csv.writer(f)
        writer.writerow(headers)

        for row in rows:
            values = row['keys'] + [row['clicks'], row['impressions'],
                     f"{row['ctr']*100:.2f}%", f"{row['position']:.1f}"]
            writer.writerow(values)
EOF
        RESULTS+=("$name: $row_count riadkov -> ${name}.json + ${name}.csv")
    else
        RESULTS+=("$name: $row_count riadkov -> ${name}.json")
    fi

    # Pre štatistiky
    if [ "$name" = "queries" ] || [ "$name" = "pages" ]; then
        local stats=$(python3 -c "
import json
data = json.load(open('$json_file'))
rows = data.get('rows', [])
clicks = sum(r['clicks'] for r in rows)
impr = sum(r['impressions'] for r in rows)
print(f'{clicks}|{impr}')
" 2>/dev/null || echo "0|0")
        if [ "$name" = "queries" ]; then
            TOTAL_QUERIES=$row_count
            QUERY_CLICKS=$(echo $stats | cut -d'|' -f1)
        elif [ "$name" = "pages" ]; then
            TOTAL_PAGES=$row_count
        fi
    fi
}

# =============================================================================
# Main
# =============================================================================

# Parsovanie argumentov
if [ "$1" = "--help" ] || [ "$1" = "-h" ] || [ -z "$1" ]; then
    show_help
    exit 0
fi

if [ "$1" = "--list" ] || [ "$1" = "-l" ]; then
    list_properties
    exit 0
fi

PROPERTY="$1"
TYPE="${2:-all}"
DATE_RANGE="${3:-last-30-days}"
DATE_END="$4"
FORMAT="json"

# Hľadaj --format
for arg in "$@"; do
    if [ "$prev" = "--format" ]; then
        FORMAT="$arg"
    fi
    prev="$arg"
done

# Validácia property
PROPERTY_CLEAN=$(echo "$PROPERTY" | sed 's/sc-domain://')

# Parsuj dátumy
parse_date_range "$DATE_RANGE" "$DATE_END"

# Vytvor output dir
DATE_STAMP=$(date +%Y-%m-%d)
EXPORT_SUBDIR="$OUTPUT_DIR/$PROPERTY_CLEAN/$DATE_STAMP"
mkdir -p "$EXPORT_SUBDIR"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  GSC Data Fetcher${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Property:    ${GREEN}$PROPERTY_CLEAN${NC}"
echo -e "  Typ:         ${GREEN}$TYPE${NC}"
echo -e "  Obdobie:     ${GREEN}$START_DATE${NC} až ${GREEN}$END_DATE${NC}"
echo -e "  Formát:      ${GREEN}$FORMAT${NC}"
echo ""

# Refresh token
echo -n "Autorizácia... "
refresh_access_token
echo -e "${GREEN}OK${NC}"
echo ""

# Fetch dáta
echo "Sťahujem dáta:"
RESULTS=()
TOTAL_QUERIES=0
TOTAL_PAGES=0
QUERY_CLICKS=0

case "$TYPE" in
    all)
        fetch_data '["query"]' "queries"
        fetch_data '["page"]' "pages"
        fetch_data '["page","query"]' "pages_queries"
        fetch_data '["country"]' "countries"
        fetch_data '["device"]' "devices"
        ;;
    queries)
        fetch_data '["query"]' "queries"
        ;;
    pages)
        fetch_data '["page"]' "pages"
        ;;
    pages_queries)
        fetch_data '["page","query"]' "pages_queries"
        ;;
    countries)
        fetch_data '["country"]' "countries"
        ;;
    devices)
        fetch_data '["device"]' "devices"
        ;;
    *)
        echo -e "${RED}Neznámy typ: $TYPE${NC}"
        exit 1
        ;;
esac

# Report
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  VÝSLEDKY${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

for result in "${RESULTS[@]}"; do
    echo -e "  ${GREEN}✓${NC} $result"
done

echo ""
echo -e "  ${YELLOW}Štatistiky:${NC}"
[ $TOTAL_QUERIES -gt 0 ] && echo "    Queries:  $TOTAL_QUERIES unikátnych keywords"
[ $TOTAL_PAGES -gt 0 ] && echo "    Pages:    $TOTAL_PAGES unikátnych URL"
[ $QUERY_CLICKS -gt 0 ] && echo "    Clicks:   $QUERY_CLICKS (z queries)"

echo ""
echo -e "  ${YELLOW}Uložené v:${NC}"
echo "    $EXPORT_SUBDIR"
echo ""
ls -la "$EXPORT_SUBDIR" 2>/dev/null | grep -E '\.(json|csv)$' | awk '{print "    " $NF " (" $5 " bytes)"}'
echo ""
