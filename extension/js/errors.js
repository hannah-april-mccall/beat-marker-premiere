window.addEventListener('error',function(event){
  var target=document.getElementById('status');
  if(target){target.className='error';target.textContent='Panel error: '+event.message;}
});
