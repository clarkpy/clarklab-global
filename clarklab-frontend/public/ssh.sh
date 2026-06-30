# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

banner() {
    echo
    echo -e "${CYAN}${BOLD}====================================================${NC}"
    echo -e "${CYAN}${BOLD}        Remote Access Setup (Hopefully works)       ${NC}"
    echo -e "${CYAN}${BOLD}====================================================${NC}"
    echo
}

msg() {
    echo -e "${BLUE}➜${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

banner

echo
echo "This script should:"
echo " • Install SSH"
echo " • Install Tailscale"
echo

msg "updating the server packages..."
sudo apt update

msg "Installing the required dependencies..."
sudo apt install -y curl ca-certificates openssh-server

success "Dependencies installed"

msg "Enabling SSH..."
sudo systemctl enable --now ssh

success "SSH is running"

msg "Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh

success "Tailscale installed"

echo
echo -e "${CYAN}${BOLD}====================================================${NC}"
echo -e "${CYAN}${BOLD}                Action Required                     ${NC}"
echo -e "${CYAN}${BOLD}====================================================${NC}"
echo

echo -e "${BOLD}In a moment, Tailscale will display a login link.${NC}"
echo
echo "Please show me the link :)"
echo

sudo tailscale up --ssh

echo
success "The server has been connected to the Tailscale network."

echo
echo -e "${CYAN}${BOLD}====================================================${NC}"
echo -e "${CYAN}${BOLD}                One Last Step                        ${NC}"
echo -e "${CYAN}${BOLD}====================================================${NC}"
echo

echo "Please run:"
echo

echo -e "${GREEN}${BOLD}tailscale ip -4${NC}"

echo
echo "and show me the output."
echo

success "Thank you! The remote access setup is hopefully complete."