import { useParams } from "react-router-dom";
import ProductEditor from "../components/ProductEditor";

const ProductEdit = () => {
  const { productId } = useParams();
  return <ProductEditor productId={productId} layout="page" />;
};

export default ProductEdit;

