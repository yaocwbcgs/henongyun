import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Diagnose from './pages/Diagnose.jsx';
import DiagnoseResult from './pages/DiagnoseResult.jsx';
import Knowledge from './pages/Knowledge.jsx';
import KnowledgeDetail from './pages/KnowledgeDetail.jsx';
import TradeList from './pages/TradeList.jsx';
import TradeDetail from './pages/TradeDetail.jsx';
import TradePublish from './pages/TradePublish.jsx';
import MachineryList from './pages/MachineryList.jsx';
import MachineryDetail from './pages/MachineryDetail.jsx';
import BookingConfirm from './pages/BookingConfirm.jsx';
import Bookings from './pages/Bookings.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import ShopList from './pages/ShopList.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Prices from './pages/Prices.jsx';
import Messages from './pages/Messages.jsx';
import Me from './pages/Me.jsx';
import Merchant from './pages/Merchant.jsx';
import Admin from './pages/Admin.jsx';
import { Login, Register, ForgotPassword } from './pages/Auth.jsx';
import PageHead from './components/PageHead.jsx';
import { Empty } from './components/ui.jsx';

function NotFound() {
  return (
    <>
      <PageHead items={[{ label: '首页', to: '/' }, { label: '页面不存在' }]} title="这个页面不在地里" desc="链接可能已失效，或者地址输错了。" />
      <div className="container section">
        <Empty
          title="404"
          desc="可以回到首页，或去供应大厅、农机服务看看。"
          action={<div className="row gap-12" style={{ justifyContent: 'center' }}><Link to="/" className="btn btn--primary btn--sm">返回首页</Link><Link to="/supply" className="btn btn--ghost btn--sm">供应大厅</Link></div>}
        />
      </div>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/diagnose" element={<Diagnose />} />
        <Route path="/diagnose/result/:id" element={<DiagnoseResult />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/knowledge/:slug" element={<KnowledgeDetail />} />
        <Route path="/supply" element={<TradeList mode="supply" />} />
        <Route path="/demand" element={<TradeList mode="demand" />} />
        <Route path="/trade/publish" element={<TradePublish />} />
        <Route path="/trade/:id" element={<TradeDetail />} />
        <Route path="/machinery" element={<MachineryList />} />
        <Route path="/machinery/:id" element={<MachineryDetail />} />
        <Route path="/bookings/confirm" element={<BookingConfirm />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/bookings/:id" element={<BookingDetail />} />
        <Route path="/shop" element={<ShopList />} />
        <Route path="/shop/:id" element={<ProductDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/prices" element={<Prices />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/me" element={<Me />} />
        <Route path="/merchant" element={<Merchant />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
