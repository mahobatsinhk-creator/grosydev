import { getShippingJwt } from '../src/bluedart.js';
import { config } from '../src/config.js';

const jwt = await getShippingJwt(true);
const ms = Date.now() + 86400000;

async function tryCode(code, area) {
  const body = {
    Request: {
      Consignee: {
        ConsigneeName: 'Test Customer',
        ConsigneeAddress1: 'Andheri',
        ConsigneeAddress2: 'Mumbai',
        ConsigneePincode: '400069',
        ConsigneeMobile: '9876543210',
        ConsigneeEmailID: 't@t.com',
      },
      Returnadds: {
        ReturnAddress1: 'WH',
        ReturnPincode: '385001',
        ReturnMobile: '9999999999',
      },
      Services: {
        ActualWeight: '0.50',
        CreditReferenceNo: `GH-${Date.now()}`,
        DeclaredValue: 500,
        PieceCount: '1',
        ItemCount: 1,
        PickupDate: `/Date(${ms})/`,
        PickupTime: '1400',
        PickupType: 'O',
        ProductCode: 'A',
        SubProductCode: 'P',
        ProductType: 2,
        PDFOutputNotRequired: true,
        RegisterPickup: false,
        Commodity: { CommodityDetail1: 'parcel' },
        Dimensions: [{ Length: 10, Breadth: 10, Height: 10, Count: 1 }],
      },
      Shipper: {
        CustomerName: 'Grosyhub',
        CustomerAddress1: 'WH Line1',
        CustomerAddress2: 'Palanpur',
        CustomerAddress3: 'Gujarat',
        CustomerPincode: '385001',
        CustomerMobile: '9999999999',
        CustomerEmailID: 's@g.com',
        CustomerCode: code,
        OriginArea: area,
        IsToPayCustomer: false,
      },
    },
    Profile: {
      Api_type: 'S',
      Area: area,
      Customercode: code,
      LicenceKey: config.bluedart.shippingLicenceKey,
      LoginID: config.bluedart.loginId,
      Version: '1.3',
    },
  };

  const res = await fetch(`${config.bluedart.baseUrl}/waybill/v1/GenerateWayBill`, {
    method: 'POST',
    headers: { JWTToken: jwt, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.text();
}

for (const [code, area] of [
  ['347970', 'PLN'],
  ['PLN347970', 'PLN'],
  ['347970', 'PLN347970'],
]) {
  const text = await tryCode(code, area);
  const awb = text.match(/"AWBNo":"(\d+)"/)?.[1];
  const info = text.match(/"StatusInformation":"([^"]+)"/)?.[1];
  console.log(`${code} / ${area} ->`, awb || info || text.slice(0, 200));
}
