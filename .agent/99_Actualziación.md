
Actualización de la aplcaición.
Vamos a adaptar todo el proeyecto para te tolere varios repositorios al mismo tiempo.
Para ello deberemos reajustar todo el proyecto desde abajo, ya que deberemos tener en cuenta varios asuntos a nivel de cada una de las vistas.
1.- Debemos acaral el concepto, ahora definiremos cada pipeline como pipeline-proycto.
	Pipeline-proyect es una pipeline que deberemos seguir el proyeto, tanto con sus proipios experitmetos con sus fases/valor. Las caracteriticas de cada una de estas son:
		a. Una Pipeline-proyect esta detereminada por la branch y por el repositorio al que pertence
		b. Podemos tener varias pipeline-proyect de un mimso proyecto, solo que tendrán dos diferentes branches que lo nombren´
		c. Podemos tener variass pipline-proyects de varios proeyctos pero deberemos definir sobre que branch van a trabajar.
2.- Para que esta implemnetación funcione deberemos tener un file de configuración, donde se define el repositorio su miror en gashub y todas las confiugraciones personalizadas para cada una de las pipeline convivan en una misma aplicación,

3.- Vistas
	a. Ejecuciones- Tres columnas, 
		la de la izquierda quiero un tab para poder ir navegando entre los difernets pipeline-proyects y vaya saleindo de manera personalizada cada una de sus fases a ejecutar.
		La columan del medio sera compartida por todas los pipelines proyect, ya que comparten tambien los limintates de runners que teniamos especificados antes.  
		Colimand ela derecha tambine será compartida
		Tanto la del medio como la de la derecha tendrán un filtro para poder seleccionar un pipline-proyect y quede mas limipio
	b. Comparten vista de gh actiosn, pero podemos filtrar
	c. Runners- Comparten, de hecho se queda igual porque comparten runners
	d. Lineaje- Cada uno tendrá su lineaje, asique hara flat aun selector
	e. Variantes- Cada una tendrá su pagina variantes teniendo un selector
	f. Servicio- Cada una tendrá su servicio, pero lo mas seguros es que sean el mismo, pero cada una tendrá su file de configuación,




4.- Perosnalización
Debemos tener un file donde definiamos cada una de las caracteriticas, tambien que apunte a su tracebilty file, su local run y todo lo necesario, pero que haya un file perosnalziado con todos los ajstes.
Cada pipline-proyect tendra un nombre nomitativo para difernecia de maenra compacta a que s pipline-pryect se refiere.
Ej:
testPipelineEpoch:
	repo:
	branch:
	traceability_path
	local_pipeline_path:
	