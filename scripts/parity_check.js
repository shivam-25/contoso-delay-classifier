const path="/Users/code_rambo/Documents/FDE/Notes/26th_oct/contoso-delay-classifier/api/model.json";
const model=require(path);
function score(v){
  const row=model.feature_order.map(n=>n.startsWith("carrier_")?(v.carrier===n.slice(8)?1:0):v[n]);
  let z=model.intercept;
  for(let i=0;i<row.length;i++) z+=((row[i]-model.mean[i])/model.scale[i])*model.coef[i];
  return 1/(1+Math.exp(-z));
}
const cases=[
 {carrier:"Delhivery",distance_km:1523,weight_kg:5.45,items:7,order_hour:1,is_sale_day:0,warehouse_backlog:50,weather_index:0.1},
 {carrier:"IndiaPost",distance_km:769,weight_kg:6.13,items:7,order_hour:14,is_sale_day:0,warehouse_backlog:36,weather_index:0.634},
 {carrier:"EcomExp",distance_km:517,weight_kg:0.28,items:6,order_hour:2,is_sale_day:0,warehouse_backlog:42,weather_index:0.068},
 {carrier:"BlueDart",distance_km:2603,weight_kg:12.09,items:1,order_hour:23,is_sale_day:1,warehouse_backlog:60,weather_index:0.9},
];
console.log(JSON.stringify(cases.map(score)));
