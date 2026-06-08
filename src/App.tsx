import { useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import {
    PhantomWalletAdapter,
    SolflareWalletAdapter,
    CoinbaseWalletAdapter,
    TrustWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

import NotFound from './pages/NotFound';
import Index from './pages/Index';
import { HELIUS_RPC } from './lib/configAddress';

import '@solana/wallet-adapter-react-ui/styles.css';

const App = () => {
    const wallets = useMemo(() => [
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
        new CoinbaseWalletAdapter(),
        new TrustWalletAdapter(),
    ], []);

    return (
        <ConnectionProvider endpoint={HELIUS_RPC}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                    <Toaster />
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export default App;