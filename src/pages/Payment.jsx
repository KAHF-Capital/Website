
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Smartphone } from 'lucide-react';
import Footer from './Footer';

export default function Payment() {
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleApplePay = () => {
        if (!email || !fullName) {
            setError('Please fill in all fields.');
            return;
        }
        setError('');
        
        // Navigate directly to confirmation page
        router.push('/confirmation');
    };

    return (
        <div className="min-h-screen bg-white">
            {/* Header */}
            <header className="border-b border-gray-200 sticky top-0 bg-white z-50">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <Link href="/learning">
                                <button className="text-gray-900 hover:text-green-600 p-2 flex items-center touch-manipulation">
                                    <ArrowLeft className="h-5 w-5 mr-2" />
                                    <span className="font-medium">Back</span>
                                </button>
                            </Link>
                            <div className="flex items-center space-x-3">
                                <img 
                                    src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
                                    alt="KAHF Capital Logo" 
                                    className="h-8 w-auto"
                                />
                                <span className="text-gray-900 font-semibold text-base">Checkout</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="max-w-md mx-auto py-8 px-4">
                <div className="bg-white rounded-lg shadow-lg">
                    <div className="p-6 border-b border-gray-200">
                        <h2 className="text-xl font-semibold">Complete Your Purchase</h2>
                        <p className="text-base text-gray-600 mt-1">Get instant access to the 50-page volatility trading e-book.</p>
                        <div className="text-center mt-4">
                            <span className="text-3xl font-bold text-gray-900">$19.99</span>
                        </div>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="fullName" className="text-base font-medium">Full Name</label>
                                <input 
                                    id="fullName" 
                                    type="text" 
                                    placeholder="John Doe" 
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="email" className="text-base font-medium">Email Address</label>
                                <input 
                                    id="email" 
                                    type="email" 
                                    placeholder="you@example.com" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        {error && <p className="text-sm text-red-600">{error}</p>}

                        <div className="space-y-4">
                            <button 
                                onClick={handleApplePay}
                                className="w-full bg-black hover:bg-gray-800 text-white text-base py-4 rounded-lg flex items-center justify-center font-medium touch-manipulation"
                            >
                                <Smartphone className="mr-2 h-5 w-5" />
                                Complete Purchase
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
}
