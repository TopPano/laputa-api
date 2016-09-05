node ('master') {
   stage 'Checkout'
   echo 'Checkout'
   // Get some code from a GitHub repository
   git url: 'git@github.com:uniray7/laputa-api.git', credentialsId:'laputa-api-cred'

   stage 'Build'
   echo 'Build'
   docker.withServer('tcp://dockerd:4243') {
      def img = docker.build("laputa-api")
   }


   stage 'Unittest'
   echo 'Unittest'

   docker.withServer('tcp://dockerd:4243') {
//      def img = sh "docker run laputa-api npm test"
   }


   stage 'Checkout Integration Test'
   echo 'Checkout Integration Test'
   // Get some code from a GitHub repository
   git url: 'git@github.com:uniray7/verpix.me.git', credentialsId:'verpix-me-cred'

   stage 'Integration Test'
   echo 'Integration test'
   docker.withServer('tcp://dockerd:4243') {
      sh 'docker-compose up verpix-dev-laputa-api &'
      sh 'sh integration_test.sh'
      sh 'sleep 100'
      sh 'docker-compose stop'
      sh 'docker-compose rm -f'
   }

}

