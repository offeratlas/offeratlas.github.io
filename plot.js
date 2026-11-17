// Greedy collision packing preserves exact reported x values and every source dot.
export function layoutDots(records,min=80,max=100){
 if(!(max>min))throw new Error('Invalid plot range');
 const lanes=[],points=[];
 for(const record of [...records].sort((a,b)=>a.average-b.average||a.id.localeCompare(b.id))){
  const x=(record.average-min)/(max-min)*100;let lane=lanes.findIndex(last=>x-last>=3);
  if(lane<0)lane=lanes.length;lanes[lane]=x;points.push({record,x,y:10+lane*18});
 }
 return {points,height:Math.max(85,28+lanes.length*18)};
}
