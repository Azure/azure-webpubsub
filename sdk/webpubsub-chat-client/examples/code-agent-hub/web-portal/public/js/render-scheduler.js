function defaultSchedule(task){
  if(typeof window!=='undefined'&&typeof window.requestAnimationFrame==='function'){
    const handle=window.requestAnimationFrame(()=>{void task()});
    return()=>{if(typeof window.cancelAnimationFrame==='function')window.cancelAnimationFrame(handle)}
  }
  const handle=setTimeout(()=>{void task()},0);
  return()=>clearTimeout(handle)
}

export function createRenderScheduler(render,{schedule=defaultSchedule,onError=()=>{}}={}){
  let pending=false;
  let scheduled=false;
  let rendering=false;
  let completionPromise=null;
  let resolveCompletion=null;
  let rejectCompletion=null;

  function ensureCompletionPromise(){
    if(!completionPromise){
      completionPromise=new Promise((resolve,reject)=>{
        resolveCompletion=resolve;
        rejectCompletion=reject;
      })
    }
    return completionPromise
  }

  function settleCompletion(error=null){
    const resolve=resolveCompletion;
    const reject=rejectCompletion;
    completionPromise=null;
    resolveCompletion=null;
    rejectCompletion=null;
    if(error)reject?.(error);
    else resolve?.()
  }

  async function flush(){
    if(rendering)return;
    scheduled=false;
    if(!pending){
      settleCompletion();
      return
    }
    pending=false;
    rendering=true;
    try{
      await render()
    }catch(error){
      pending=false;
      settleCompletion(error);
      try{onError(error)}catch{}
      return
    }finally{
      rendering=false
    }
    if(pending){
      scheduled=true;
      schedule(flush);
      return
    }
    settleCompletion()
  }

  return function scheduleRender(){
    pending=true;
    const promise=ensureCompletionPromise();
    if(!scheduled&&!rendering){
      scheduled=true;
      schedule(flush)
    }
    return promise
  }
}