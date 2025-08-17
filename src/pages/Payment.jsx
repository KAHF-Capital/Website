
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Loader2, Smartphone } from 'lucide-react';

export default function Payment() {
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState('');

    const handlePayment = async (e) => {
        e.preventDefault();
        if (!email || !fullName) {
            setError('Please fill in all fields.');
            return;
        }
        setError('');
        setIsLoading(true);

        try {
            // Simulate payment processing
            await new Promise(resolve => setTimeout(resolve, 2000));
            setIsSuccess(true);
        } catch (err) {
            setError('There was an error processing your payment. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApplePay = async () => {
        if (!email || !fullName) {
            setError('Please fill in all fields.');
            return;
        }
        setError('');
        setIsLoading(true);

        try {
            // Simulate Apple Pay processing
            await new Promise(resolve => setTimeout(resolve, 1500));
            setIsSuccess(true);
        } catch (err) {
            setError('There was an error processing your payment. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center p-4">
                <div className="w-full max-w-sm sm:max-w-md text-center bg-white rounded-lg shadow-lg p-6">
                    <CheckCircle className="h-10 sm:h-12 w-10 sm:w-12 text-green-500 mx-auto mb-3 sm:mb-4" />
                    <h2 className="text-lg sm:text-xl font-semibold mb-2">Purchase Successful!</h2>
                    <p className="text-sm sm:text-base text-gray-600 mb-4">Your e-book has been sent to {email}.</p>
                    <p className="text-gray-600 text-sm sm:text-base mb-6">Please check your inbox (and spam folder) to download it.</p>
                    <Link to="/" className="w-full inline-block">
                        <button className="w-full bg-gray-800 hover:bg-gray-900 text-white py-2 px-4 rounded text-sm sm:text-base">
                            Back to Home
                        </button>
                    </Link>
                </div>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-white">
            {/* Header */}
            <header className="border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 sm:space-x-4">
                            <Link to="/learning">
                                <button className="text-gray-900 hover:text-green-600 p-2 flex items-center">
                                    <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
                                    <span className="hidden sm:inline">Back to Modules</span>
                                    <span className="sm:hidden">Back</span>
                                </button>
                            </Link>
                            <div className="flex items-center space-x-2 sm:space-x-4">
                                <img 
                                    src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/87af3bb58_image.png" 
                                    alt="KAHF Capital Logo" 
                                    className="h-6 sm:h-8 w-auto"
                                />
                                <span className="text-gray-900 font-semibold text-sm sm:text-base">Checkout</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="max-w-sm sm:max-w-md mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
                <div className="bg-white rounded-lg shadow-lg">
                    <div className="p-4 sm:p-6 border-b border-gray-200">
                        <h2 className="text-lg sm:text-xl font-semibold">Complete Your Purchase</h2>
                        <p className="text-sm sm:text-base text-gray-600 mt-1">Get instant access to the 50-page volatility trading e-book.</p>
                        <div className="text-center mt-4">
                            <span className="text-2xl sm:text-3xl font-bold text-gray-900">$19.99</span>
                        </div>
                    </div>
                    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                        <div className="space-y-3 sm:space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="fullName" className="text-sm sm:text-base font-medium">Full Name</label>
                                <input 
                                    id="fullName" 
                                    type="text" 
                                    placeholder="John Doe" 
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="email" className="text-sm sm:text-base font-medium">Email Address</label>
                                <input 
                                    id="email" 
                                    type="email" 
                                    placeholder="you@example.com" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                            </div>
                        </div>

                        {error && <p className="text-sm text-red-600">{error}</p>}

                        <div className="space-y-3">
                            <button 
                                onClick={handleApplePay}
                                className="w-full bg-black hover:bg-gray-800 text-white text-sm sm:text-base py-2 sm:py-3 rounded-md flex items-center justify-center"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Smartphone className="mr-2 h-4 w-4" />
                                        Pay with Apple Pay
                                    </>
                                )}
                            </button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-300"></div>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white px-2 text-gray-500">Or</span>
                                </div>
                            </div>

                            <form onSubmit={handlePayment}>
                                <button 
                                    type="submit" 
                                    className="w-full bg-green-600 hover:bg-green-700 text-white text-sm sm:text-base py-2 sm:py-3 rounded-md flex items-center justify-center" 
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        'Pay with Card'
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
