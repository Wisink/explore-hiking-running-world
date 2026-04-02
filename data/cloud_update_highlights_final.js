(async()=>{
  const db=wx.cloud.database();
  let count=0;
  try{
    console.log('=== 开始更新路线亮点文案 ===');
    const {total}=await db.collection('routes').count();
    console.log('云端共',total,'条路线');
    const routes=[];
    for(let i=0;i<total;i+=100){
      const {data}=await db.collection('routes').skip(i).limit(100).field({_id:true,name:true,description:true,features:true,best_season:true,difficulty:true,cost:true,traffic:true}).get();
      routes.push(...data);
    }
    console.log('已获取',routes.length,'条路线详情');
    function genH(r){
      var n=String(r.name||''),d=String(r.description||''),f=r.features||[],s=r.best_season||[],df=String(r.difficulty||''),c=r.cost||{},t=String(r.traffic||''),p=[];
      if(d)p.push(d);
      if(Array.isArray(f)&&f.length>0)p.push('沿途可以欣赏到'+f.slice(0,5).join('、')+'等美景。');
      if(Array.isArray(s)&&s.length>0)p.push(s.join('和')+'是最佳出行时间。');
      if(df==='初级'||df==='轻松')p.push('路线轻松平缓，非常适合新手和亲子出行。');
      else if(df==='中级'||df==='适中')p.push('路线有一定挑战性，适合有一定徒步经验的朋友。');
      else if(df==='高级'||df==='困难')p.push('路线难度较大，适合经验丰富的户外爱好者挑战。');
      if(t.length>10)p.push('交通便利，方便到达。');
      var cType=typeof c==='object'?(c.type||''):String(c||'');
      if(cType==='免费')p.push('全程免费，无需门票。');
      else if(cType)p.push('费用参考：'+cType+(c.note?'（'+c.note+'）':'')+'。');
      p.push('来'+n+'，感受自然的魅力吧！');
      return p.join('');
    }
    let ok=0,fail=0;
    for(let i=0;i<routes.length;i+=10){
      var batch=routes.slice(i,i+10);
      for(var j=0;j<batch.length;j++){
        var r=batch[j];
        if(!r._id){fail++;continue}
        try{
          var h=r.highlights||genH(r);
          await db.collection('routes').doc(r._id).update({data:{highlights:h}});
          ok++;
          console.log('✅',r.name);
        }catch(e){
          fail++;
          console.error('❌',r.name||r._id,':',e.message);
        }
      }
      console.log('进度:',Math.min(i+10,routes.length)+'/'+routes.length);
    }
    console.log('=== 完成！更新',ok,'条，失败',fail,'条 ===');
  }catch(e){
    console.error('脚本出错:',e.message);
  }
})()