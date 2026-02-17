export type Locale = "en" | "es";

export const messages = {
  en: {
    auth: {
      signInWithGoogle: "Sign in with Google",
      signOut: "Sign out"
    },
    common: {
      language: "Language",
      english: "English",
      spanish: "Spanish"
    },
    landing: {
      badge: "Algorand Portfolio Intelligence",
      title: "One dashboard for all your Algorand wallets",
      subtitle:
        "Consolidate ALGO and ASA balances, compute FIFO cost basis, track unrealized PnL, and estimate staking + DeFi yield from Tinyman, Folks Finance, and Reti activity.",
      openDashboard: "Open Dashboard"
    },
    dashboard: {
      title: "Algorand Portfolio Dashboard",
      subtitle: "Consolidated balances, FIFO cost basis, unrealized PnL, and DeFi estimates.",
      manageWallets: "Manage wallets",
      hideAmounts: "Hide amounts",
      showAmounts: "Show amounts",
      refresh: "Refresh",
      refreshing: "Refreshing...",
      tabs: {
        overview: "Overview",
        transactions: "Transactions",
        defi: "DeFi Positions",
        wallets: "Wallets",
        settings: "Settings"
      },
      cards: {
        totalValue: "Total Value",
        costBasis: "Cost Basis",
        unrealizedPnl: "Unrealized PnL",
        totalValueHelp: "Current USD value of priced assets across all linked wallets. Assets without prices are excluded.",
        costBasisHelp: "Remaining acquisition cost of current holdings using FIFO lots (fees included per policy).",
        unrealizedHelp: "Paper profit/loss on current holdings. Formula: current value minus remaining FIFO cost basis."
      },
      errors: {
        refreshFailed: "Refresh failed."
      },
      overview: {
        hideZero: "Hide 0 balance tokens",
        heldByWallets: "Held by wallets",
        noWalletBreakdown: "No wallet-level balance details for this asset.",
        headers: {
          asset: "Asset",
          balance: "Balance",
          price: "Price",
          value: "Value",
          costBasis: "Cost Basis",
          unrealized: "Unrealized"
        },
        noPrice: "no price",
        noAssets: "No assets to show. Disable filter or refresh snapshot."
      },
      transactions: {
        allDirections: "All directions",
        inbound: "Inbound",
        outbound: "Outbound",
        internal: "Internal",
        allTypes: "All types",
        payment: "Payment",
        assetTransfer: "Asset transfer",
        searchPlaceholder: "Search tx id, asset, wallet, counterparty",
        rows: "rows",
        headers: {
          time: "Time",
          type: "Type",
          direction: "Direction",
          asset: "Asset",
          amount: "Amount",
          price: "Price",
          value: "Value",
          fee: "Fee",
          wallet: "Wallet",
          counterparty: "Counterparty",
          txId: "Tx ID"
        },
        noRows: "No transactions match your filters.",
        estimated: "est."
      },
      defi: {
        yieldEstimate: "Yield estimate",
        estimated: "estimated",
        positions: "positions",
        searchPlaceholder: "Search protocol, type, wallet",
        headers: {
          vault: "Vault",
          atDeposit: "At Deposit",
          now: "Now",
          yield: "Yield",
          pnl: "PnL",
          apy: "APY",
          dailyYield: "Daily Yield"
        },
        noRows: "No DeFi positions match your search.",
        vaultSuffix: "Vault"
      },
      wallets: {
        noWallets: "No wallets linked.",
        value: "Value",
        costBasis: "Cost basis"
      },
      settings: {
        theme: "Theme",
        themeDesc: "Toggle between light and dark mode",
        fifo: "Cost basis method: FIFO. Average-cost mode is designed for a future extension."
      },
      footer: {
        lastSnapshot: "Last snapshot",
        pricesAsOf: "Prices as of",
        none: "none",
        unknown: "unknown"
      }
    },
    walletsPage: {
      title: "Wallet Linking",
      backToDashboard: "Back to dashboard",
      connectWallet: "Connect wallet",
      switchWallet: "Switch wallet",
      disconnect: "Disconnect",
      connectedWallet: "Connected wallet",
      notConnected: "Not connected",
      selectAccount: "Select account",
      alreadyVerified: "This wallet is already verified.",
      notLinkedYet: "This wallet is not linked yet.",
      verifyOwnership: "Verify wallet ownership",
      verifying: "Verifying...",
      alreadyVerifiedCta: "Already verified",
      explainOne:
        "This creates a 0-ALGO verification transaction with a nonce note, requests wallet signature, and submits it automatically.",
      explainTwo: "To link multiple wallets, repeat: connect another wallet, then verify.",
      linkedWallets: "Linked wallets",
      status: "Status",
      verified: "Verified",
      pendingVerification: "Pending verification",
      remove: "Remove",
      noLinkedWallets: "No linked wallets yet.",
      confirmRemovePrefix: "Remove wallet",
      connectPeraFirst: "Connect Pera Wallet first.",
      awaitingSignature: "Awaiting wallet signature...",
      noSignedTxn: "No signed transaction returned by wallet.",
      submittingSignedTxn: "Submitting signed transaction...",
      walletSigningFailed: "Wallet signing failed",
      challengeCreationFailed: "Challenge creation failed",
      noWalletReturned: "No wallet account returned. If Pera is already connected, use Disconnect and try again.",
      invalidAddress: "Wallet returned invalid address",
      walletConnected: "Wallet connected.",
      walletConnectionFailed: "Wallet connection failed",
      walletDisconnected: "Wallet disconnected.",
      walletVerifiedAndLinked: "Wallet verified and linked.",
      verificationFailed: "Verification failed",
      walletRemoved: "Wallet removed.",
      failedRemoveWallet: "Failed to remove wallet"
    }
  },
  es: {
    auth: {
      signInWithGoogle: "Iniciar sesion con Google",
      signOut: "Cerrar sesion"
    },
    common: {
      language: "Idioma",
      english: "Ingles",
      spanish: "Espanol"
    },
    landing: {
      badge: "Inteligencia de Portafolio Algorand",
      title: "Un panel para todas tus wallets de Algorand",
      subtitle:
        "Consolida balances de ALGO y ASA, calcula costo FIFO, sigue PnL no realizado y estima rendimiento de staking + DeFi en Tinyman, Folks Finance y Reti.",
      openDashboard: "Abrir panel"
    },
    dashboard: {
      title: "Panel de Portafolio Algorand",
      subtitle: "Balances consolidados, costo FIFO, PnL no realizado y estimaciones DeFi.",
      manageWallets: "Gestionar wallets",
      hideAmounts: "Ocultar montos",
      showAmounts: "Mostrar montos",
      refresh: "Actualizar",
      refreshing: "Actualizando...",
      tabs: {
        overview: "Resumen",
        transactions: "Transacciones",
        defi: "Posiciones DeFi",
        wallets: "Wallets",
        settings: "Configuracion"
      },
      cards: {
        totalValue: "Valor total",
        costBasis: "Costo base",
        unrealizedPnl: "PnL no realizado",
        totalValueHelp: "Valor USD actual de activos con precio en todas las wallets vinculadas. Los activos sin precio se excluyen.",
        costBasisHelp: "Costo de adquisicion restante de holdings actuales usando lotes FIFO (incluye fees segun politica).",
        unrealizedHelp: "Ganancia/perdida no realizada sobre holdings actuales. Formula: valor actual menos costo FIFO restante."
      },
      errors: {
        refreshFailed: "La actualizacion fallo."
      },
      overview: {
        hideZero: "Ocultar tokens con balance 0",
        heldByWallets: "Distribucion por wallet",
        noWalletBreakdown: "No hay detalle de balances por wallet para este activo.",
        headers: {
          asset: "Activo",
          balance: "Balance",
          price: "Precio",
          value: "Valor",
          costBasis: "Costo base",
          unrealized: "No realizado"
        },
        noPrice: "sin precio",
        noAssets: "No hay activos para mostrar. Desactiva el filtro o actualiza el snapshot."
      },
      transactions: {
        allDirections: "Todas direcciones",
        inbound: "Entrada",
        outbound: "Salida",
        internal: "Interna",
        allTypes: "Todos tipos",
        payment: "Pago",
        assetTransfer: "Transferencia ASA",
        searchPlaceholder: "Buscar tx id, activo, wallet, contraparte",
        rows: "filas",
        headers: {
          time: "Hora",
          type: "Tipo",
          direction: "Direccion",
          asset: "Activo",
          amount: "Cantidad",
          price: "Precio",
          value: "Valor",
          fee: "Fee",
          wallet: "Wallet",
          counterparty: "Contraparte",
          txId: "Tx ID"
        },
        noRows: "No hay transacciones para esos filtros.",
        estimated: "est."
      },
      defi: {
        yieldEstimate: "Rendimiento estimado",
        estimated: "estimado",
        positions: "posiciones",
        searchPlaceholder: "Buscar protocolo, tipo, wallet",
        headers: {
          vault: "Vault",
          atDeposit: "En deposito",
          now: "Ahora",
          yield: "Rendimiento",
          pnl: "PnL",
          apy: "APY",
          dailyYield: "Rend. diario"
        },
        noRows: "No hay posiciones DeFi para esa busqueda.",
        vaultSuffix: "Vault"
      },
      wallets: {
        noWallets: "No hay wallets vinculadas.",
        value: "Valor",
        costBasis: "Costo base"
      },
      settings: {
        theme: "Tema",
        themeDesc: "Cambiar entre modo claro y oscuro",
        fifo: "Metodo de costo base: FIFO. El modo promedio se deja para una extension futura."
      },
      footer: {
        lastSnapshot: "Ultimo snapshot",
        pricesAsOf: "Precios al",
        none: "ninguno",
        unknown: "desconocido"
      }
    },
    walletsPage: {
      title: "Vinculacion de Wallet",
      backToDashboard: "Volver al panel",
      connectWallet: "Conectar wallet",
      switchWallet: "Cambiar wallet",
      disconnect: "Desconectar",
      connectedWallet: "Wallet conectada",
      notConnected: "No conectada",
      selectAccount: "Seleccionar cuenta",
      alreadyVerified: "Esta wallet ya esta verificada.",
      notLinkedYet: "Esta wallet aun no esta vinculada.",
      verifyOwnership: "Verificar propiedad de wallet",
      verifying: "Verificando...",
      alreadyVerifiedCta: "Ya verificada",
      explainOne:
        "Esto crea una transaccion de verificacion 0-ALGO con una nota nonce, solicita firma en la wallet y la envia automaticamente.",
      explainTwo: "Para vincular multiples wallets, repite: conecta otra wallet y luego verifica.",
      linkedWallets: "Wallets vinculadas",
      status: "Estado",
      verified: "Verificada",
      pendingVerification: "Verificacion pendiente",
      remove: "Eliminar",
      noLinkedWallets: "Aun no hay wallets vinculadas.",
      confirmRemovePrefix: "Eliminar wallet",
      connectPeraFirst: "Primero conecta Pera Wallet.",
      awaitingSignature: "Esperando firma de la wallet...",
      noSignedTxn: "La wallet no devolvio una transaccion firmada.",
      submittingSignedTxn: "Enviando transaccion firmada...",
      walletSigningFailed: "Fallo al firmar en wallet",
      challengeCreationFailed: "Fallo al crear challenge",
      noWalletReturned: "No se devolvio ninguna cuenta. Si Pera ya esta conectado, usa Desconectar e intenta de nuevo.",
      invalidAddress: "La wallet devolvio una direccion invalida",
      walletConnected: "Wallet conectada.",
      walletConnectionFailed: "Fallo de conexion con wallet",
      walletDisconnected: "Wallet desconectada.",
      walletVerifiedAndLinked: "Wallet verificada y vinculada.",
      verificationFailed: "Verificacion fallida",
      walletRemoved: "Wallet eliminada.",
      failedRemoveWallet: "No se pudo eliminar wallet"
    }
  }
} as const;
