"""
backend/utils/auth.py
======================
Wallet ownership verification via EIP-191 personal_sign signatures.

Exposes a single public function:

    verify_signature(address, message, signature) -> bool

The caller signs `message` client-side with MetaMask / RainbowKit using
``personal_sign`` (EIP-191).  The backend recovers the signer address from
the signature and checks it matches the claimed ``address``.

Dependencies:
    eth-account  (pip install eth-account)
"""

from eth_account import Account
from eth_account.messages import encode_defunct


def verify_signature(address: str, message: str, signature: str) -> bool:
    """
    Verify that ``signature`` was produced by the private key of ``address``
    over the UTF-8 ``message`` string.

    Process
    -------
    1. Encode the raw message into an EIP-191 "personal_sign" hash
       (prefixes it with ``\\x19Ethereum Signed Message:\\n<len>``).
    2. Recover the signer's address from the signature bytes.
    3. Compare recovered address to the claimed ``address``
       case-insensitively.

    Parameters
    ----------
    address : str
        The Ethereum address claiming ownership (e.g. ``"0xAbC...123"``).
    message : str
        The plain-text message that was signed on the frontend.
    signature : str
        Hex-encoded signature returned by ``personal_sign`` (0x-prefixed).

    Returns
    -------
    bool
        ``True``  — signature is valid and signer matches ``address``.
        ``False`` — mismatch, malformed input, or any unexpected error.
        Never raises.
    """
    try:
        # Build the EIP-191 signable message from the raw text
        signable_message = encode_defunct(text=message)

        # Recover the Ethereum address that produced the signature
        recovered: str = Account.recover_message(
            signable_message,
            signature=signature,
        )

        # Case-insensitive comparison (EIP-55 checksum vs lowercase)
        return recovered.lower() == address.lower()

    except Exception:
        # Malformed signature, wrong length, invalid hex, etc. → treat as invalid
        return False
