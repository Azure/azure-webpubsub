(()=>{
  try{
    const savedTheme=localStorage.getItem('cp-theme')||'light';
    if(savedTheme==='light')document.documentElement.classList.add('light');
  }catch{}
})();