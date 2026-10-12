/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/folio_vault.json`.
 */
export type FolioVault = {
  "address": "CgbMfovmjXQvmLRSSh5s4Qu1ZdD8DYk8jUwvUYuP4UmR",
  "metadata": {
    "name": "folioVault",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "activate",
      "discriminator": [
        194,
        203,
        35,
        100,
        151,
        55,
        170,
        82
      ],
      "accounts": [
        {
          "name": "guardian",
          "signer": true,
          "relations": [
            "registry"
          ]
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          },
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "createVault",
      "discriminator": [
        29,
        237,
        247,
        208,
        193,
        82,
        54,
        135
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "registry"
              },
              {
                "kind": "account",
                "path": "registry.vault_count",
                "account": "registry"
              }
            ]
          }
        },
        {
          "name": "settlementMint"
        },
        {
          "name": "vaultSettlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "settlementMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "manager",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "deposit",
      "docs": [
        "remaining_accounts: for each held mint in `vault.held` order, `[mint, vault_token_account]`."
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "investor",
          "writable": true,
          "signer": true
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          },
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "investor"
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "investorSettlement",
          "writable": true
        },
        {
          "name": "vaultSettlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "settlementMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minShares",
          "type": "u64"
        },
        {
          "name": "prices",
          "type": {
            "defined": {
              "name": "priceUpdate"
            }
          }
        }
      ]
    },
    {
      "name": "execute",
      "discriminator": [
        130,
        221,
        242,
        154,
        13,
        193,
        189,
        29
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "finalize",
      "discriminator": [
        171,
        61,
        218,
        56,
        127,
        115,
        12,
        217
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true
        },
        {
          "name": "proposer",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "fundGas",
      "discriminator": [
        193,
        180,
        0,
        111,
        189,
        96,
        59,
        88
      ],
      "accounts": [
        {
          "name": "funder",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeRegistry",
      "discriminator": [
        189,
        181,
        20,
        17,
        174,
        57,
        249,
        59
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "settlementMint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "guardian",
          "type": "pubkey"
        },
        {
          "name": "priceSigner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "pause",
      "discriminator": [
        211,
        22,
        221,
        251,
        74,
        121,
        193,
        47
      ],
      "accounts": [
        {
          "name": "guardian",
          "signer": true,
          "relations": [
            "registry"
          ]
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          },
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "propose",
      "discriminator": [
        93,
        253,
        82,
        168,
        118,
        33,
        102,
        90
      ],
      "accounts": [
        {
          "name": "manager",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          },
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "vault.proposal_count",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "targets",
          "type": {
            "vec": {
              "defined": {
                "name": "target"
              }
            }
          }
        },
        {
          "name": "plan",
          "type": "string"
        },
        {
          "name": "votingDays",
          "type": "u8"
        },
        {
          "name": "bond",
          "type": "u64"
        }
      ]
    },
    {
      "name": "rebalance",
      "docs": [
        "remaining_accounts: first `[mint, vault_token_account]` for every held mint in `vault.held`",
        "order, then exactly the accounts the router instruction expects, in its order."
      ],
      "discriminator": [
        108,
        158,
        77,
        9,
        210,
        52,
        88,
        62
      ],
      "accounts": [
        {
          "name": "keeper",
          "docs": [
            "The registry's keeper. Pays the transaction and any new token account, and is paid back a",
            "flat fee from the vault's gas tank."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          },
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "sellMint"
        },
        {
          "name": "buyMint"
        },
        {
          "name": "vaultSell",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "sellTokenProgram"
              },
              {
                "kind": "account",
                "path": "sellMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultBuy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "buyTokenProgram"
              },
              {
                "kind": "account",
                "path": "buyMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "router"
        },
        {
          "name": "sellTokenProgram"
        },
        {
          "name": "buyTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "maxSell",
          "type": "u64"
        },
        {
          "name": "minBuy",
          "type": "u64"
        },
        {
          "name": "routeData",
          "type": "bytes"
        },
        {
          "name": "prices",
          "type": {
            "defined": {
              "name": "priceUpdate"
            }
          }
        }
      ]
    },
    {
      "name": "redeem",
      "docs": [
        "remaining_accounts: for each held mint in `vault.held` order,",
        "`[mint, vault_token_account, recipient_token_account]`."
      ],
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        },
        {
          "name": "forfeit",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "seed",
      "discriminator": [
        255,
        178,
        140,
        239,
        113,
        22,
        214,
        231
      ],
      "accounts": [
        {
          "name": "investor",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "investor"
              }
            ]
          }
        },
        {
          "name": "settlementMint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "investorSettlement",
          "writable": true
        },
        {
          "name": "vaultSettlement",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "settlementMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setAsset",
      "discriminator": [
        243,
        216,
        48,
        30,
        63,
        58,
        91,
        239
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "registry"
          ]
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "allowed",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setGuardian",
      "discriminator": [
        147,
        243,
        50,
        121,
        154,
        164,
        50,
        30
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "registry"
          ]
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "guardian",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setKeeper",
      "discriminator": [
        102,
        94,
        23,
        78,
        157,
        222,
        243,
        214
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "registry"
          ]
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "keeper",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setPriceSigner",
      "discriminator": [
        95,
        60,
        180,
        216,
        70,
        79,
        14,
        153
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "registry"
          ]
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "signer",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setRouter",
      "discriminator": [
        236,
        248,
        107,
        200,
        151,
        160,
        44,
        250
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "registry"
          ]
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "program",
          "type": "pubkey"
        },
        {
          "name": "allowed",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setStrategy",
      "docs": [
        "Plan text and target weights. Only before activation."
      ],
      "discriminator": [
        251,
        41,
        210,
        173,
        140,
        96,
        78,
        235
      ],
      "accounts": [
        {
          "name": "manager",
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          },
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "text",
          "type": "string"
        },
        {
          "name": "targets",
          "type": {
            "vec": {
              "defined": {
                "name": "target"
              }
            }
          }
        }
      ]
    },
    {
      "name": "unpause",
      "discriminator": [
        169,
        144,
        4,
        38,
        10,
        141,
        188,
        255
      ],
      "accounts": [
        {
          "name": "guardian",
          "signer": true,
          "relations": [
            "registry"
          ]
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          },
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "vote",
      "discriminator": [
        227,
        110,
        155,
        23,
        136,
        126,
        172,
        25
      ],
      "accounts": [
        {
          "name": "voter",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true
        },
        {
          "name": "position",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "voter"
              }
            ]
          }
        },
        {
          "name": "voteRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "proposal"
              },
              {
                "kind": "account",
                "path": "voter"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "approve",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "proposal",
      "discriminator": [
        26,
        94,
        189,
        187,
        116,
        136,
        53,
        33
      ]
    },
    {
      "name": "registry",
      "discriminator": [
        47,
        174,
        110,
        246,
        184,
        182,
        252,
        218
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    },
    {
      "name": "voteRecord",
      "discriminator": [
        112,
        9,
        123,
        165,
        234,
        9,
        157,
        167
      ]
    }
  ],
  "events": [
    {
      "name": "deposited",
      "discriminator": [
        111,
        141,
        26,
        45,
        161,
        35,
        100,
        57
      ]
    },
    {
      "name": "gasFunded",
      "discriminator": [
        65,
        38,
        137,
        46,
        170,
        207,
        205,
        73
      ]
    },
    {
      "name": "planPosted",
      "discriminator": [
        12,
        177,
        223,
        97,
        3,
        241,
        25,
        40
      ]
    },
    {
      "name": "proposalCreated",
      "discriminator": [
        186,
        8,
        160,
        108,
        81,
        13,
        51,
        206
      ]
    },
    {
      "name": "proposalFinalized",
      "discriminator": [
        159,
        104,
        210,
        220,
        86,
        209,
        61,
        51
      ]
    },
    {
      "name": "rebalanced",
      "discriminator": [
        74,
        101,
        57,
        244,
        181,
        179,
        52,
        182
      ]
    },
    {
      "name": "redeemed",
      "discriminator": [
        14,
        29,
        183,
        71,
        31,
        165,
        107,
        38
      ]
    },
    {
      "name": "seeded",
      "discriminator": [
        95,
        55,
        75,
        113,
        178,
        157,
        251,
        224
      ]
    },
    {
      "name": "stateChanged",
      "discriminator": [
        0,
        150,
        55,
        224,
        43,
        26,
        214,
        192
      ]
    },
    {
      "name": "vaultCreated",
      "discriminator": [
        117,
        25,
        120,
        254,
        75,
        236,
        78,
        115
      ]
    },
    {
      "name": "voteCast",
      "discriminator": [
        39,
        53,
        195,
        104,
        188,
        17,
        225,
        213
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notAdmin",
      "msg": "Only the registry admin can do this"
    },
    {
      "code": 6001,
      "name": "notGuardian",
      "msg": "Only the guardian can do this"
    },
    {
      "code": 6002,
      "name": "notManager",
      "msg": "Only the vault manager can do this"
    },
    {
      "code": 6003,
      "name": "wrongState",
      "msg": "The vault is not in the right state for this"
    },
    {
      "code": 6004,
      "name": "belowMinimumSeed",
      "msg": "Seed is below the 10 USDC minimum"
    },
    {
      "code": 6005,
      "name": "invalidName",
      "msg": "Name must be 1-32 bytes"
    },
    {
      "code": 6006,
      "name": "invalidPlanLength",
      "msg": "Plan must be 1-1000 bytes"
    },
    {
      "code": 6007,
      "name": "noPlanPosted",
      "msg": "Post a plan before the first trade"
    },
    {
      "code": 6008,
      "name": "missingPrice",
      "msg": "A held asset has no signed price"
    },
    {
      "code": 6009,
      "name": "zeroPrice",
      "msg": "A signed price is zero"
    },
    {
      "code": 6010,
      "name": "stalePrices",
      "msg": "Signed prices are older than 60 seconds or in the future"
    },
    {
      "code": 6011,
      "name": "lengthMismatch",
      "msg": "Price lists differ in length"
    },
    {
      "code": 6012,
      "name": "invalidPriceSignature",
      "msg": "The price signature is missing or not from the price signer"
    },
    {
      "code": 6013,
      "name": "emptyVault",
      "msg": "The vault holds nothing"
    },
    {
      "code": 6014,
      "name": "zeroShares",
      "msg": "Deposit buys zero shares"
    },
    {
      "code": 6015,
      "name": "slippageTooHigh",
      "msg": "Fewer shares than the minimum asked for"
    },
    {
      "code": 6016,
      "name": "nothingToRedeem",
      "msg": "Nothing to redeem"
    },
    {
      "code": 6017,
      "name": "insufficientShares",
      "msg": "Not enough shares"
    },
    {
      "code": 6018,
      "name": "heldAccountsMismatch",
      "msg": "The accounts passed do not match the vault's held assets"
    },
    {
      "code": 6019,
      "name": "wrongVaultTokenAccount",
      "msg": "This token account is not the vault's account for that mint"
    },
    {
      "code": 6020,
      "name": "wrongRecipientAccount",
      "msg": "Recipient token account has the wrong mint"
    },
    {
      "code": 6021,
      "name": "routerNotAllowed",
      "msg": "Swap program is not allowlisted"
    },
    {
      "code": 6022,
      "name": "assetNotAllowed",
      "msg": "Asset is not allowlisted"
    },
    {
      "code": 6023,
      "name": "assetNotHeld",
      "msg": "The vault does not hold the asset it is selling"
    },
    {
      "code": 6024,
      "name": "sellExceeded",
      "msg": "The trade sold more than allowed"
    },
    {
      "code": 6025,
      "name": "buyTooLow",
      "msg": "The trade bought less than the minimum"
    },
    {
      "code": 6026,
      "name": "tradeLossTooHigh",
      "msg": "The trade lost more than 2% against the signed prices"
    },
    {
      "code": 6027,
      "name": "collateralDecreased",
      "msg": "A vault balance went down that should not have"
    },
    {
      "code": 6028,
      "name": "authorityChanged",
      "msg": "A vault token account gained a delegate, close authority or new owner"
    },
    {
      "code": 6029,
      "name": "tooManyAssets",
      "msg": "A vault may hold at most 10 assets"
    },
    {
      "code": 6030,
      "name": "listFull",
      "msg": "Too many allowlisted entries"
    },
    {
      "code": 6031,
      "name": "overflow",
      "msg": "Math overflow"
    },
    {
      "code": 6032,
      "name": "notKeeper",
      "msg": "Only the keeper can do this"
    },
    {
      "code": 6033,
      "name": "invalidTargets",
      "msg": "Targets must be allowlisted, distinct, above zero and sum to 100%"
    },
    {
      "code": 6034,
      "name": "strategyLocked",
      "msg": "The strategy can only change through a passed proposal once the vault is active"
    },
    {
      "code": 6035,
      "name": "gasTankEmpty",
      "msg": "The vault's gas tank cannot pay the keeper"
    },
    {
      "code": 6036,
      "name": "rebalanceTooSoon",
      "msg": "A rebalance cycle already ran in the last 12 hours"
    },
    {
      "code": 6037,
      "name": "sellNotOverweight",
      "msg": "The asset sold is not above its target weight"
    },
    {
      "code": 6038,
      "name": "buyNotUnderweight",
      "msg": "The asset bought is not below its target weight"
    },
    {
      "code": 6039,
      "name": "targetOvershoot",
      "msg": "The trade overshoots a target weight"
    },
    {
      "code": 6040,
      "name": "invalidVotingPeriod",
      "msg": "Voting period must be 1-14 days"
    },
    {
      "code": 6041,
      "name": "bondTooSmall",
      "msg": "The proposal bond is below the minimum"
    },
    {
      "code": 6042,
      "name": "proposalAlreadyOpen",
      "msg": "This vault already has a proposal in voting or timelock"
    },
    {
      "code": 6043,
      "name": "votingClosed",
      "msg": "Voting on this proposal is closed"
    },
    {
      "code": 6044,
      "name": "votingStillOpen",
      "msg": "Voting is still open"
    },
    {
      "code": 6045,
      "name": "noVotingPower",
      "msg": "No shares to vote with on this proposal"
    },
    {
      "code": 6046,
      "name": "wrongProposalStatus",
      "msg": "The proposal is not in the right status for this"
    },
    {
      "code": 6047,
      "name": "timelockActive",
      "msg": "The timelock has not ended"
    },
    {
      "code": 6048,
      "name": "wrongProposer",
      "msg": "That account is not the proposer"
    }
  ],
  "types": [
    {
      "name": "deposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "investor",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "vaultValue",
            "type": "u64"
          },
          {
            "name": "priceTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "gasFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "gasTank",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "planPosted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "version",
            "type": "u64"
          },
          {
            "name": "plan",
            "type": "string"
          },
          {
            "name": "targets",
            "type": {
              "vec": {
                "defined": {
                  "name": "target"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "position",
      "docs": [
        "One investor's shares in one vault. Not a token, so shares cannot be transferred."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "snapshotProposal",
            "docs": [
              "`id + 1` of the open proposal for which `snapshot_shares` was recorded, or 0."
            ],
            "type": "u64"
          },
          {
            "name": "snapshotShares",
            "docs": [
              "Shares held just before the first deposit made while that proposal was open."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceUpdate",
      "docs": [
        "`prices[i]` = settlement base units for ONE WHOLE `mints[i]` token."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mints",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "prices",
            "type": {
              "vec": "u64"
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "proposal",
      "docs": [
        "A curator's request to change the vault's target weights and plan."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "proposer",
            "type": "pubkey"
          },
          {
            "name": "targets",
            "type": {
              "vec": {
                "defined": {
                  "name": "target"
                }
              }
            }
          },
          {
            "name": "plan",
            "type": "string"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "votingEndsAt",
            "type": "i64"
          },
          {
            "name": "timelockEndsAt",
            "docs": [
              "Set when the proposal passes."
            ],
            "type": "i64"
          },
          {
            "name": "totalShares",
            "docs": [
              "Vault share supply when proposed; quorum is measured against it."
            ],
            "type": "u64"
          },
          {
            "name": "yesVotes",
            "type": "u64"
          },
          {
            "name": "noVotes",
            "type": "u64"
          },
          {
            "name": "bond",
            "docs": [
              "Lamports held on this account (above rent) as the curator's bond."
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "proposalStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "proposalCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "targets",
            "type": {
              "vec": {
                "defined": {
                  "name": "target"
                }
              }
            }
          },
          {
            "name": "plan",
            "type": "string"
          },
          {
            "name": "votingEndsAt",
            "type": "i64"
          },
          {
            "name": "bond",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "proposalFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "passed",
            "type": "bool"
          },
          {
            "name": "yesVotes",
            "type": "u64"
          },
          {
            "name": "noVotes",
            "type": "u64"
          },
          {
            "name": "timelockEndsAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "proposalStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "voting"
          },
          {
            "name": "queued"
          },
          {
            "name": "rejected"
          },
          {
            "name": "executed"
          }
        ]
      }
    },
    {
      "name": "rebalanced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "sellMint",
            "type": "pubkey"
          },
          {
            "name": "buyMint",
            "type": "pubkey"
          },
          {
            "name": "sold",
            "type": "u64"
          },
          {
            "name": "bought",
            "type": "u64"
          },
          {
            "name": "planVersion",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "redeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "investor",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "mints",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "amounts",
            "type": {
              "vec": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "registry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Governance. Changes allowlists, guardian and price signer."
            ],
            "type": "pubkey"
          },
          {
            "name": "guardian",
            "docs": [
              "Can activate, pause and unpause vaults without a delay."
            ],
            "type": "pubkey"
          },
          {
            "name": "priceSigner",
            "docs": [
              "ed25519 key the backend signs prices with."
            ],
            "type": "pubkey"
          },
          {
            "name": "settlementMint",
            "docs": [
              "The stablecoin every vault is seeded and subscribed in. Fixed at init."
            ],
            "type": "pubkey"
          },
          {
            "name": "assets",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "routers",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "vaultCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "keeper",
            "docs": [
              "The automation key allowed to run target-weight rebalances. Defaults to the guardian."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "seeded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "investor",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "stateChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": {
              "defined": {
                "name": "vaultState"
              }
            }
          },
          {
            "name": "to",
            "type": {
              "defined": {
                "name": "vaultState"
              }
            }
          }
        ]
      }
    },
    {
      "name": "target",
      "docs": [
        "One target weight: `bps` of vault value should sit in `mint`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "bps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "registry",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "manager",
            "type": "pubkey"
          },
          {
            "name": "settlementMint",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "vaultState"
              }
            }
          },
          {
            "name": "totalShares",
            "docs": [
              "All shares in existence, DEAD_SHARES included."
            ],
            "type": "u64"
          },
          {
            "name": "plan",
            "docs": [
              "The manager's investment plan, free text. Informational only."
            ],
            "type": "string"
          },
          {
            "name": "planVersion",
            "docs": [
              "Bumped by every `set_plan`; 0 means no plan yet."
            ],
            "type": "u64"
          },
          {
            "name": "held",
            "docs": [
              "Mints the vault holds. USDC is always first and never leaves."
            ],
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "targets",
            "docs": [
              "Target weights, summing to 100%. Set once before activation; afterwards only a passed",
              "proposal changes them."
            ],
            "type": {
              "vec": {
                "defined": {
                  "name": "target"
                }
              }
            }
          },
          {
            "name": "gasTank",
            "docs": [
              "Lamports held on this account (above rent) that pay the keeper for rebalances."
            ],
            "type": "u64"
          },
          {
            "name": "cycleStart",
            "docs": [
              "Start of the current rebalance cycle (unix seconds); 0 means a new cycle may start now."
            ],
            "type": "i64"
          },
          {
            "name": "proposalCount",
            "docs": [
              "Proposals ever made; the next proposal's id."
            ],
            "type": "u64"
          },
          {
            "name": "openProposal",
            "docs": [
              "`id + 1` of the proposal in voting or timelock, or 0 if none."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vaultCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "manager",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "vaultState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "draft"
          },
          {
            "name": "seeded"
          },
          {
            "name": "active"
          },
          {
            "name": "paused"
          },
          {
            "name": "closed"
          }
        ]
      }
    },
    {
      "name": "voteCast",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "voter",
            "type": "pubkey"
          },
          {
            "name": "approve",
            "type": "bool"
          },
          {
            "name": "weight",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "voteRecord",
      "docs": [
        "One holder's vote on one proposal. Its existence prevents voting twice."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "voter",
            "type": "pubkey"
          },
          {
            "name": "approve",
            "type": "bool"
          },
          {
            "name": "weight",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
