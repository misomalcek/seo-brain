#!/bin/bash

# Google Search Console API - OAuth 2.0 Flow
# Pre aisvet.sk

CLIENT_ID="${GSC_CLIENT_ID}"
CLIENT_SECRET="${GSC_CLIENT_SECRET:?set GSC_CLIENT_SECRET in env}"
REDIRECT_URI="http://localhost:8080"
SCOPE="https://www.googleapis.com/auth/webmasters.readonly"
SITE_URL="sc-domain:aisvet.sk"

# Token file pre uloženie refresh tokenu
TOKEN_FILE="/opt/team-brain/gsc/.gsc_tokens.json"

# Farby pre výstup
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Google Search Console API ===${NC}"
echo ""

# Funkcia na získanie nového tokenu
get_new_token() {
    # Vytvor OAuth URL
    AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPE}&access_type=offline&prompt=consent"

    echo -e "${YELLOW}1. Otvor túto URL v browseri:${NC}"
    echo ""
    echo "$AUTH_URL"
    echo ""
    echo -e "${YELLOW}2. Prihláš sa a autorizuj prístup${NC}"
    echo -e "${YELLOW}3. Po presmerovaní skopíruj 'code' parameter z URL${NC}"
    echo "   (URL bude vyzerať: http://localhost:8080/?code=XXXXX&scope=...)"
    echo ""
    read -p "Zadaj authorization code: " AUTH_CODE

    # Vymeň code za tokeny
    echo ""
    echo "Vymieňam code za access token..."

    TOKEN_RESPONSE=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=${CLIENT_ID}" \
        -d "client_secret=${CLIENT_SECRET}" \
        -d "code=${AUTH_CODE}" \
        -d "grant_type=authorization_code" \
        -d "redirect_uri=${REDIRECT_URI}")

    # Skontroluj či máme access token
    ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
    REFRESH_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"refresh_token":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$ACCESS_TOKEN" ]; then
        echo -e "${RED}Chyba pri získavaní tokenu:${NC}"
        echo "$TOKEN_RESPONSE"
        exit 1
    fi

    # Ulož tokeny
    echo "$TOKEN_RESPONSE" > "$TOKEN_FILE"
    echo -e "${GREEN}Token úspešne získaný a uložený!${NC}"
}

# Funkcia na refresh tokenu
refresh_token() {
    REFRESH_TOKEN=$(cat "$TOKEN_FILE" | grep -o '"refresh_token":"[^"]*"' | cut -d'"' -f4)

    TOKEN_RESPONSE=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=${CLIENT_ID}" \
        -d "client_secret=${CLIENT_SECRET}" \
        -d "refresh_token=${REFRESH_TOKEN}" \
        -d "grant_type=refresh_token")

    ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$ACCESS_TOKEN" ]; then
        echo -e "${RED}Refresh token expiroval, potrebujem nový...${NC}"
        get_new_token
        ACCESS_TOKEN=$(cat "$TOKEN_FILE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
    fi
}

# Skontroluj či máme uložený token
if [ -f "$TOKEN_FILE" ]; then
    echo "Našiel som uložený token, skúšam refresh..."
    refresh_token
else
    echo "Nemám token, potrebujem autorizáciu..."
    get_new_token
    ACCESS_TOKEN=$(cat "$TOKEN_FILE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
fi

echo ""
echo -e "${GREEN}=== Volám GSC API ===${NC}"
echo ""

# Encoded site URL
ENCODED_SITE_URL=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${SITE_URL}', safe=''))")

# API endpoint
API_URL="https://searchconsole.googleapis.com/webmasters/v3/sites/${ENCODED_SITE_URL}/searchAnalytics/query"

# Dátumy - posledných 16 mesiacov
END_DATE=$(date +%Y-%m-%d)
START_DATE=$(date -v-16m +%Y-%m-%d 2>/dev/null || date -d "16 months ago" +%Y-%m-%d)

echo "Obdobie: $START_DATE až $END_DATE"
echo ""

# === QUERIES (Keywords) ===
echo -e "${YELLOW}=== QUERIES (Keywords Performance) ===${NC}"
echo ""

QUERIES_RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "startDate": "'"$START_DATE"'",
        "endDate": "'"$END_DATE"'",
        "dimensions": ["query"],
        "rowLimit": 25000
    }')

echo "$QUERIES_RESPONSE" > "/opt/team-brain/gsc/queries_raw.json"
echo "Uložené do: /opt/team-brain/gsc/queries_raw.json"
echo ""
echo "Prvých 50 riadkov:"
echo "$QUERIES_RESPONSE" | head -c 5000
echo ""
echo ""

# === PAGES ===
echo -e "${YELLOW}=== PAGES Performance ===${NC}"
echo ""

PAGES_RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "startDate": "'"$START_DATE"'",
        "endDate": "'"$END_DATE"'",
        "dimensions": ["page"],
        "rowLimit": 25000
    }')

echo "$PAGES_RESPONSE" > "/opt/team-brain/gsc/pages_raw.json"
echo "Uložené do: /opt/team-brain/gsc/pages_raw.json"
echo ""
echo "Prvých 50 riadkov:"
echo "$PAGES_RESPONSE" | head -c 5000
echo ""
echo ""

# === PAGES + QUERIES kombinácia ===
echo -e "${YELLOW}=== PAGES + QUERIES kombinácia ===${NC}"
echo ""

COMBO_RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "startDate": "'"$START_DATE"'",
        "endDate": "'"$END_DATE"'",
        "dimensions": ["page", "query"],
        "rowLimit": 25000
    }')

echo "$COMBO_RESPONSE" > "/opt/team-brain/gsc/pages_queries_raw.json"
echo "Uložené do: /opt/team-brain/gsc/pages_queries_raw.json"
echo ""
echo "Prvých 50 riadkov:"
echo "$COMBO_RESPONSE" | head -c 5000
echo ""

echo ""
echo -e "${GREEN}=== HOTOVO ===${NC}"
echo "Všetky surové dáta uložené v ~/gsc-api/"
ls -la "$HOME/gsc-api/"
