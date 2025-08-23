import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

const EbookPreview = ({ isOpen, onClose }) => {
    const [currentPage, setCurrentPage] = useState(0);
    const [zoom, setZoom] = useState(1);

    // Debug logging
    console.log('EbookPreview rendered, isOpen:', isOpen);

    const pages = [
        {
            id: 3,
            title: "FOREWORD",
            content: "In the following pages, you will find a step-by-step guide on how to use institutional-level strategies to maximize your trading profits. From A to Z. Zero to hero. Truly a definitive guide designed for the retail investor.",
            type: "foreword"
        },
        {
            id: 2,
            title: "MASTERING VOLATILITY TRADING",
            subtitle: "Institutional Strategies Unveiled",
            edition: "2025 Edition",
            author: "KAHF Capital",
            type: "title"
        },
        {
            id: 4,
            title: "Introduction",
            content: "In the following pages, you will find a step-by-step guide on how to use institutional-level strategies to maximize your trading profits. From A to Z. Zero to hero. Truly a definitive guide designed for the retail investor.\n\nThough you might be asking how we know these strategies work, or why we're selling a $20 e-book instead of deploying the strategy ourselves. The answer is simple: We know because we do this. Every single day.\n\nWe, KAHF Capital, are a small group of former and current institutional traders, quants, and algorithm writers dissatisfied with how our employers operate. The current state of the stock market is nothing short of a casino. Market makers are the house, and hedge funds are the mob. There's a reason why 90% of retail traders are unprofitable compared to institutions: They have access to better tools. Better insights. Better information.\n\nYou can never beat the house. That is, unless, you learn to play the game their way.\n\nWhat you'll learn in the first few chapters are the basics: Long/Short straddles, iron condors, and reverse iron condors. Executing the trades are easy - picking the right ones and managing them is the tough part. That's where we come in.\n\nVolatility arbitrage (vol arb) strategies by themselves have about a 30-40% success rate, and are mainly used by unsophisticated investors as hedging strategies. Think long VIX calls or futures. Institutions, on the other hand, are actively deploying this strategy for consistent profits in any market condition. The more volatility, the more profitable it becomes. Sounds obvious, but this is how firms like Two Sigma and Citadel realize 20%+ return in some of the worst market conditions in history: 2001, 2008, 2012, and 2020.\n\nSmart money follows smart money.\n\nIn this guide we'll teach you how to see what institutions are trading behind the curtain - within the dark pools. You can use dark pool activity to forecast, with an 85% better success rate, which stocks are likely to have future volatility above market expectations. If you don't believe us, we encourage you to test the dark pool method in a paper money account and watch, like clockwork, as the company's implied volatility tends to tick up after a significant dark pool signal. The same applies for short vol trades, which this guide also covers.\n\nOur mission at KAHF Capital is simple: We want to help everyday traders like you beat the house by using their own methods against them. We are always here to help; if you have any questions or are unclear about any of the topics mentioned below, you can reach us at info@kahfcapital.com. Please allow 24-48 hours for a response.\n\nHappy trading, and remember: Kill All Hedge Funds\n\nYours Truly,\nKAHF CAPITAL",
            type: "content"
        },
        {
            id: 5,
            title: "01 LONG STRADDLES",
            content: "Your Gateway to Volatility Profits",
            type: "chapter"
        },
        {
            id: 6,
            title: "What Are Long Straddles?",
            content: "Picture this: You know Tesla is about to announce earnings, but you have absolutely no idea if the news will be fantastic or terrible. Either way, you're convinced the stock is going to make a big move. This is where long straddles become your best friend.\n\nA long straddle is beautifully simple: you buy a call option and a put option at the same strike price, with the same expiration date. You're essentially betting that the stock will move significantly in either direction - you don't care which way, just that it moves enough to make you money.",
            type: "content"
        },
        {
            id: 7,
            title: "The Mechanics: Your Two-Legged Profit Machine",
            content: "Here's how it works in practice:\n\nThe Setup:\n• Buy one call option (same strike, same expiration)\n• Buy one put option (same strike, same expiration)\n• Use at-the-money (ATM) options for maximum efficiency\n\nExample: Apple is trading at $150\n• Buy AAPL $150 Call for $4.50\n• Buy AAPL $150 Put for $4.20\n• Total cost: $8.70 per share ($870 per contract)\n\nYour Breakeven Points:\n• Upper breakeven: $150 + $8.70 = $158.70\n• Lower breakeven: $150 - $8.70 = $141.30\n\nSummary of Profit/Loss: If Apple moves to $170 or drops to $130, you're making serious money. If it stays at $150, you lose your entire investment.",
            type: "content"
        },
        {
            id: 7.5,
            title: "When to Deploy Long Straddles",
            content: "Perfect Timing Scenarios:\n• Earnings announcements (1-2 days before)\n• FDA drug approvals for biotech companies\n• Federal Reserve meetings for index ETFs\n• Product launches for tech companies\n• Court decisions for companies facing litigation\n\nMarket Conditions:\n• Implied volatility is low relative to expected actual volatility\n• You expect a move greater than 1.5x the straddle cost\n• Options have 2-4 weeks until expiration\n\nExecution Strategy\nStep 1: Stock Selection\nLook for companies with upcoming binary events. Tesla, Apple, and biotech companies are goldmines during earnings season.\n\nStep 2: Timing Your Entry\nEnter positions 2-4 weeks before the expected volatility event. This gives you time for the trade to develop while avoiding excessive time decay.\n\nStep 3: Order Placement\nUse a single multi-leg order to buy both options simultaneously. This ensures better execution and prevents the market from moving against you between orders.\n\nStep 4: Managing the Trade\n• Set profit targets at 50-100% of premium paid\n• Exit before expiration to preserve time value\n• Consider closing one leg if it hits a 100% gain",
            type: "content"
        },
        {
            id: 8,
            title: "02 SHORT STRADDLES",
            content: "The Contrarian's Approach",
            type: "chapter"
        },
        {
            id: 9,
            title: "The Contrarian's Approach",
            content: "While long straddles are for volatility hunters, short straddles are for premium collectors who believe the market is overestimating future volatility. You become the house, collecting premium from others who anticipate large market movements.\n\nUnderstanding the Mechanics\nThe Setup:\n• Sell one call option (same strike, same expiration)\n• Sell one put option (same strike, same expiration)\n• Collect premium upfront\n• Profit if the stock stays near the strike price\n\nExample: Microsoft is trading at $350, and you believe it will trade in a narrow range.\n• Sell MSFT $350 Call for $8.50\n• Sell MSFT $350 Put for $8.20\n• Total credit received: $16.70 per share ($1,670 per contract)\n\nYour Profit Zone:\n• Maximum profit: $1,670 (if MSFT closes exactly at $350)\n• Upper breakeven: $350 + $16.70 = $366.70\n• Lower breakeven: $350 - $16.70 = $333.30",
            type: "content"
        },
        {
            id: 10,
            title: "Active Management",
            content: "Monitor positions daily\nBe prepared to adjust quickly\nHave clear rules for when to cut losses\n\nReal-World Examples\n\nQQQ Range-Bound Success:\nDuring a period when QQQ was trading between $320-$340 for several weeks, a trader sold the $330 straddle for $12.50. QQQ remained in range, and the straddle expired worthless, allowing the trader to keep the full premium.\n\nCSCO Risk Management:\nA trader sold a Cisco $42 straddle for $5.12 but noticed the stock beginning to trend higher. Rather than take a large loss, they bought the $46 call to cap their upside risk, converting the position to a modified iron condor and limiting their loss to $87.",
            type: "content"
        },
        {
            id: 11,
            title: "03 IRON CONDORS",
            content: "Your Swiss Army Knife for Sideways Markets",
            type: "chapter"
        },
        {
            id: 12,
            title: "Deconstructing the Iron Condor",
            content: "If you've been looking for a strategy that can generate consistent income in range-bound markets while keeping your risk defined, iron condors might be your new best friend. Think of them as the sensible cousin of the short straddle - they collect premium like a pro but with built-in protection.\n\nAn iron condor consists of four options positions that create a \"condor\" shaped profit/loss diagram:\n\nThe Four-Legged Structure:\n1. Sell an out-of-the-money put (closer to current price)\n2. Buy a further out-of-the-money put (protective position)\n3. Sell an out-of-the-money call (closer to current price)\n4. Buy a further out-of-the-money call (protective position)\n\nExample: SPY trading at $450\n• Sell SPY $440 Put for $3.00\n• Buy SPY $435 Put for $2.00\n• Sell SPY $460 Call for $3.00\n• Buy SPY $465 Call for $2.00\n• Net Credit: $2.00 per share ($200 per contract)\n\nThe Beautiful Risk Profile\n• Maximum Profit: $200 (if SPY closes between $440-$460)\n• Maximum Loss: $300 (spread width minus credit received)\n• Breakeven Points: $438 (lower) and $462 (upper)\n• Profit Zone: 5.3% range around current price",
            type: "content"
        },
        {
            id: 13,
            title: "Iron Condor Content",
            content: "This content is blurred in the preview.",
            type: "blurred"
        },
        {
            id: 14,
            title: "Iron Condor Content",
            content: "This content is blurred in the preview.",
            type: "blurred"
        },
        {
            id: 15,
            title: "Iron Condor Content",
            content: "This content is blurred in the preview.",
            type: "blurred"
        },
        {
            id: 16,
            title: "04 REVERSE IRON CONDORS",
            content: "Advanced Strategy Content",
            type: "blurred"
        }
    ];

    const nextPage = () => {
        if (currentPage < pages.length - 1) {
            setCurrentPage(currentPage + 1);
        }
    };

    const prevPage = () => {
        if (currentPage > 0) {
            setCurrentPage(currentPage - 1);
        }
    };

    const resetZoom = () => {
        setZoom(1);
    };

    const increaseZoom = () => {
        setZoom(Math.min(zoom + 0.2, 3));
    };

    const decreaseZoom = () => {
        setZoom(Math.max(zoom - 0.2, 0.5));
    };

    const renderPage = (page) => {
        const isBlurred = page.type === "blurred";
        
        return (
            <div 
                className={`bg-white rounded-lg shadow-lg mx-auto transition-all duration-300 ${
                    isBlurred ? 'filter blur-sm' : ''
                }`}
                style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center',
                    minHeight: '600px',
                    maxWidth: '800px',
                    width: '100%'
                }}
            >
                {page.type === "foreword" && (
                    <div className="flex items-center justify-center h-full p-8">
                        <div className="w-64 h-64 bg-orange-100 rounded-full flex items-center justify-center">
                            <h1 className="text-2xl font-serif font-bold text-gray-800">{page.title}</h1>
                        </div>
                    </div>
                )}

                {page.type === "title" && (
                    <div className="flex items-center justify-center h-full p-8 bg-gray-50">
                        <div className="text-center">
                            <div className="mb-4">
                                <hr className="w-16 mx-auto mb-2" />
                                <p className="text-sm font-serif">{page.edition}</p>
                                <hr className="w-16 mx-auto mt-2" />
                            </div>
                            <h1 className="text-4xl font-bold mb-4">{page.title}</h1>
                            <p className="text-xl font-serif mb-8">{page.subtitle}</p>
                            <div className="mb-4">
                                <hr className="w-16 mx-auto mb-2" />
                                <p className="text-sm font-serif">{page.author}</p>
                                <hr className="w-16 mx-auto mt-2" />
                            </div>
                        </div>
                    </div>
                )}

                {page.type === "chapter" && (
                    <div className="flex items-center justify-center h-full p-8">
                        <div className="text-center">
                            <div className="mb-8">
                                <h2 className="text-6xl font-serif font-bold mb-4">{page.title.split(' ')[0]}</h2>
                                <div className="w-64 h-32 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-8">
                                    <h1 className="text-xl font-serif font-bold">{page.title.split(' ').slice(1).join(' ')}</h1>
                                </div>
                                <h2 className="text-6xl font-serif font-bold">{page.title.split(' ')[0]}</h2>
                            </div>
                        </div>
                    </div>
                )}

                {page.type === "content" && (
                    <div className="p-8">
                        <h2 className="text-2xl font-bold mb-6">{page.title}</h2>
                        <div className="prose max-w-none">
                            {page.content.split('\n').map((paragraph, index) => (
                                <p key={index} className="mb-4 text-gray-700 leading-relaxed">
                                    {paragraph}
                                </p>
                            ))}
                        </div>
                    </div>
                )}

                {page.type === "blurred" && (
                    <div className="flex items-center justify-center h-full p-8">
                        <div className="text-center">
                            <div className="w-64 h-32 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-8">
                                <h1 className="text-xl font-serif font-bold">{page.title}</h1>
                            </div>
                            <p className="text-gray-600">This content is available in the full e-book</p>
                        </div>
                    </div>
                )}

                <div className="absolute bottom-4 right-4 text-gray-500 text-sm">
                    {page.id}
                </div>
            </div>
        );
    };

    if (!isOpen) {
        console.log('EbookPreview: Modal is closed, returning null');
        return null;
    }
    
    console.log('EbookPreview: Modal is open, rendering content');

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
            <div className="bg-white rounded-lg w-full max-w-6xl h-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold">E-book Preview</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={decreaseZoom}
                            className="p-2 hover:bg-gray-100 rounded-lg"
                            disabled={zoom <= 0.5}
                        >
                            <ZoomOut className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-medium">{Math.round(zoom * 100)}%</span>
                        <button
                            onClick={increaseZoom}
                            className="p-2 hover:bg-gray-100 rounded-lg"
                            disabled={zoom >= 3}
                        >
                            <ZoomIn className="h-4 w-4" />
                        </button>
                        <button
                            onClick={resetZoom}
                            className="p-2 hover:bg-gray-100 rounded-lg"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="flex items-center space-x-4">
                        <button
                            onClick={prevPage}
                            disabled={currentPage === 0}
                            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <span className="text-sm font-medium">
                            Page {currentPage + 1} of {pages.length}
                        </span>
                        <button
                            onClick={nextPage}
                            disabled={currentPage === pages.length - 1}
                            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4">
                    <div className="flex justify-center">
                        {renderPage(pages[currentPage])}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EbookPreview;
