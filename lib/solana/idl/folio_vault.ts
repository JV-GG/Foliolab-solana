/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/folio_vault.json`.
 */
export type FolioVault = {
  "address": "9PY9RRXQuMtHXDyvWNL5ohFrsSux5SLrJhhdtuBgLUJH",
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
                "path": "registry.vaultCount",
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
      "name": "setPlan",
      "discriminator": [
        200,
        237,
        247,
        74,
        57,
        123,
        11,
        120
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
          "name": "vault",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "text",
          "type": "string"
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
    }
  ]
};
