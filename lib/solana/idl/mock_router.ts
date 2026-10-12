/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/mock_router.json`.
 */
export type MockRouter = {
  "address": "FeE32TVg1Yk4DVe4jS3SELK13dQsbbDUWyY4dYKmQhjm",
  "metadata": {
    "name": "mockRouter",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "swap",
      "discriminator": [
        248,
        198,
        158,
        145,
        225,
        117,
        135,
        200
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "userSrc",
          "writable": true
        },
        {
          "name": "userDst",
          "writable": true
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "poolSrc",
          "writable": true
        },
        {
          "name": "poolDst",
          "writable": true
        },
        {
          "name": "srcMint"
        },
        {
          "name": "dstMint"
        },
        {
          "name": "srcTokenProgram"
        },
        {
          "name": "dstTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        },
        {
          "name": "amountOut",
          "type": "u64"
        }
      ]
    }
  ]
};
