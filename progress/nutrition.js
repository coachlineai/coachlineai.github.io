export function nutritionEstimate({age,weightKg,heightCm,sex,workouts,losing}){
  const base=10*weightKg+6.25*heightCm-5*age;
  const activity={'0–2':1.3,'3–5':1.5,'6+':1.7}[workouts];
  const offsets=sex==='Male'?[5]:sex==='Female'?[-161]:[-161,5];
  return {
    intakeAt:rate=>offsets.map(offset=>Math.round((base+offset)*activity+(losing?-1:1)*rate*500)),
    canShowIntake:values=>age>=18&&weightKg>0&&heightCm>0&&values[0]>=Math.max(1500,base+offsets[0])&&values.at(-1)<=5000
  };
}
